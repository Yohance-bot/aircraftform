"""Workshop upload + processing orchestration."""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import traceback
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from database import SessionLocal
from services import ffmpeg_service, transcription_service, workshop_analysis_service
from workshop_models import ProcessingStatus, Workshop

logger = logging.getLogger("amc.workshop")

BACKEND_ROOT = Path(__file__).resolve().parent
UPLOADS_ROOT = BACKEND_ROOT / "uploads"
VIDEOS_DIR = UPLOADS_ROOT / "videos"
AUDIO_DIR = UPLOADS_ROOT / "audio"
CHUNKS_DIR = AUDIO_DIR / "chunks"

# Estimated progress milestones (spec).
PROGRESS_UPLOADING = 10
PROGRESS_EXTRACTING = 30
PROGRESS_TRANSCRIBING = 90
PROGRESS_ANALYZING = 95
PROGRESS_COMPLETED = 100


def ensure_upload_dirs() -> None:
    for directory in (VIDEOS_DIR, AUDIO_DIR, CHUNKS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def _safe_stem(filename: str) -> str:
    stem = Path(filename).stem
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
    return cleaned[:80] or "video"


def video_destination(workshop_id: int, original_filename: str) -> Path:
    suffix = Path(original_filename or "video.mp4").suffix.lower() or ".mp4"
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    name = f"{workshop_id}_{stamp}_{_safe_stem(original_filename)}{suffix}"
    return VIDEOS_DIR / name


def audio_destination(workshop_id: int) -> Path:
    return AUDIO_DIR / f"{workshop_id}.wav"


def chunks_destination(workshop_id: int) -> Path:
    return CHUNKS_DIR / str(workshop_id)


def status_progress(status: str, *, progress: int | None = None) -> int:
    if progress is not None:
        return max(0, min(100, progress))
    mapping = {
        ProcessingStatus.UPLOADING: PROGRESS_UPLOADING,
        ProcessingStatus.EXTRACTING_AUDIO: PROGRESS_EXTRACTING,
        ProcessingStatus.TRANSCRIBING: PROGRESS_TRANSCRIBING,
        ProcessingStatus.ANALYZING: PROGRESS_ANALYZING,
        ProcessingStatus.COMPLETED: PROGRESS_COMPLETED,
        ProcessingStatus.FAILED: PROGRESS_UPLOADING,
    }
    return mapping.get(status, 0)


def create_workshop_record(
    db: Session,
    *,
    title: str,
    trainer: str,
    workshop_date: date,
    video_path: str,
) -> Workshop:
    workshop = Workshop(
        title=title.strip(),
        trainer=trainer.strip(),
        workshop_date=workshop_date,
        uploaded_video_path=video_path,
        processing_status=ProcessingStatus.UPLOADING,
        progress=PROGRESS_UPLOADING,
    )
    db.add(workshop)
    db.commit()
    db.refresh(workshop)
    return workshop


def get_workshop(db: Session, workshop_id: int) -> Workshop | None:
    return db.get(Workshop, workshop_id)


def _log_stage(workshop_id: int, stage: str, message: str, **extra: object) -> None:
    details = " ".join(f"{key}={value!r}" for key, value in extra.items())
    suffix = f" ({details})" if details else ""
    logger.info("[workshop=%s][%s] %s%s", workshop_id, stage, message, suffix)


def mark_workshop_failed(workshop_id: int, message: str) -> None:
    """Best-effort FAILED status when the pipeline cannot update the row itself."""
    db = SessionLocal()
    try:
        workshop = db.get(Workshop, workshop_id)
        if not workshop:
            logger.error(
                "[workshop=%s] Cannot mark FAILED — workshop row not found",
                workshop_id,
            )
            return
        _set_status(db, workshop, ProcessingStatus.FAILED, error_message=message)
        logger.error("[workshop=%s] Marked FAILED: %s", workshop_id, message)
    except Exception:
        logger.exception(
            "[workshop=%s] Failed to persist FAILED status to database",
            workshop_id,
        )
    finally:
        db.close()


def dispatch_workshop_pipeline(workshop_id: int) -> None:
    """FastAPI BackgroundTasks entry point — confirms callback ran, then detaches work.

    Workshop processing (FFmpeg + Groq) can run for many minutes. Starlette keeps
    BackgroundTasks tied to the HTTP request lifecycle, which Render and other hosts
    may terminate on request timeout. A detached thread survives after the response.
    """
    logger.info(
        "[workshop=%s] BackgroundTasks callback invoked (thread=%s)",
        workshop_id,
        threading.current_thread().name,
    )
    thread = threading.Thread(
        target=run_workshop_pipeline,
        args=(workshop_id,),
        name=f"workshop-pipeline-{workshop_id}",
        daemon=False,
    )
    thread.start()
    logger.info(
        "[workshop=%s] Detached pipeline thread started (name=%s, ident=%s)",
        workshop_id,
        thread.name,
        thread.ident,
    )


def run_workshop_pipeline(workshop_id: int) -> None:
    """Thread entry wrapper — logs lifecycle and guarantees FAILED on escape exceptions."""
    started = time.monotonic()
    logger.info("[workshop=%s] ========== PIPELINE START ==========", workshop_id)
    try:
        process_workshop(workshop_id)
        elapsed = time.monotonic() - started
        logger.info(
            "[workshop=%s] ========== PIPELINE END (%.1fs) ==========",
            workshop_id,
            elapsed,
        )
    except Exception as exc:
        elapsed = time.monotonic() - started
        logger.exception(
            "[workshop=%s] ========== PIPELINE UNHANDLED EXCEPTION (%.1fs) ==========",
            workshop_id,
            elapsed,
        )
        mark_workshop_failed(workshop_id, str(exc))


def _set_status(
    db: Session,
    workshop: Workshop,
    status: str,
    *,
    progress: int | None = None,
    error_message: str | None = None,
    transcript: str | None = None,
    audio_path: str | None = None,
    overall_score: float | None = None,
    summary: str | None = None,
    analysis_json: str | None = None,
) -> None:
    workshop.processing_status = status
    workshop.progress = status_progress(status, progress=progress)
    workshop.updated_at = datetime.utcnow()
    if error_message is not None:
        workshop.error_message = error_message[:2000]
    if transcript is not None:
        workshop.transcript = transcript
    if audio_path is not None:
        workshop.audio_path = audio_path
    if overall_score is not None:
        workshop.overall_score = overall_score
    if summary is not None:
        workshop.summary = summary
    if analysis_json is not None:
        workshop.analysis_json = analysis_json
    db.commit()
    logger.info(
        "[workshop=%s] DB status -> %s (progress=%s)",
        workshop.id,
        workshop.processing_status,
        workshop.progress,
    )


def _transcription_progress(done: int, total: int) -> int:
    """Interpolate 30% → 90% while chunks are transcribed."""
    if total <= 0:
        return PROGRESS_TRANSCRIBING
    ratio = done / total
    return int(PROGRESS_EXTRACTING + ratio * (PROGRESS_TRANSCRIBING - PROGRESS_EXTRACTING))


def _fail_workshop(
    db: Session,
    workshop_id: int,
    exc: BaseException,
    *,
    transcript: str = "",
) -> None:
    """Log full traceback and persist FAILED with the exception message."""
    logger.exception(
        "[workshop=%s] Stage failed: %s\n%s",
        workshop_id,
        exc,
        traceback.format_exc(),
    )
    db.rollback()
    workshop = db.get(Workshop, workshop_id)
    if not workshop:
        mark_workshop_failed(workshop_id, str(exc))
        return
    _set_status(
        db,
        workshop,
        ProcessingStatus.FAILED,
        error_message=str(exc),
        transcript=transcript or workshop.transcript,
    )


def process_workshop(workshop_id: int) -> None:
    """Background pipeline: extract audio → transcribe → analyze → store results."""
    db = SessionLocal()
    chunk_paths: list[Path] = []
    created_chunks: list[Path] = []
    transcript = ""
    stage_started = time.monotonic()

    try:
        _log_stage(workshop_id, "init", "Loading workshop record from database")
        workshop = db.get(Workshop, workshop_id)
        if not workshop:
            msg = "Workshop record not found in database."
            logger.error("[workshop=%s] %s", workshop_id, msg)
            mark_workshop_failed(workshop_id, msg)
            return

        _log_stage(
            workshop_id,
            "init",
            "Workshop loaded",
            title=workshop.title,
            status=workshop.processing_status,
            video_path=workshop.uploaded_video_path,
        )

        if not workshop.uploaded_video_path:
            _set_status(
                db, workshop, ProcessingStatus.FAILED,
                error_message="No uploaded video path on record.",
            )
            return

        video_path = Path(workshop.uploaded_video_path)
        if not video_path.is_absolute():
            video_path = (BACKEND_ROOT / video_path).resolve()
        audio_path = audio_destination(workshop_id)
        chunks_dir = chunks_destination(workshop_id)

        _log_stage(
            workshop_id,
            "paths",
            "Resolved filesystem paths",
            video=str(video_path),
            audio=str(audio_path),
            chunks_dir=str(chunks_dir),
            video_exists=video_path.exists(),
            video_bytes=video_path.stat().st_size if video_path.exists() else 0,
        )

        # --- Extract audio ---
        stage_started = time.monotonic()
        _log_stage(workshop_id, "ffmpeg", "Starting audio extraction")
        _set_status(db, workshop, ProcessingStatus.EXTRACTING_AUDIO)
        ffmpeg_service.assert_ffmpeg_available()
        ffmpeg_service.validate_video_file(video_path)
        ffmpeg_service.extract_audio(video_path, audio_path)
        _set_status(db, workshop, ProcessingStatus.EXTRACTING_AUDIO, audio_path=str(audio_path.resolve()))
        _log_stage(
            workshop_id,
            "ffmpeg",
            "Audio extraction complete",
            elapsed_s=round(time.monotonic() - stage_started, 1),
            audio_bytes=audio_path.stat().st_size if audio_path.exists() else 0,
        )

        # --- Chunk if needed ---
        stage_started = time.monotonic()
        _log_stage(workshop_id, "chunking", "Splitting audio for Groq upload limits")
        chunk_paths = ffmpeg_service.split_audio_chunks(audio_path, chunks_dir)
        created_chunks = [
            p for p in chunk_paths
            if p.resolve() != audio_path.resolve()
        ]
        _log_stage(
            workshop_id,
            "chunking",
            "Chunking complete",
            elapsed_s=round(time.monotonic() - stage_started, 1),
            chunk_count=len(chunk_paths),
            chunk_sizes=[p.stat().st_size for p in chunk_paths if p.exists()],
        )

        # --- Transcribe ---
        stage_started = time.monotonic()
        _log_stage(
            workshop_id,
            "transcription",
            "Starting Groq transcription",
            chunks=len(chunk_paths),
        )
        _set_status(db, workshop, ProcessingStatus.TRANSCRIBING)

        def on_chunk(done: int, total: int) -> None:
            _log_stage(
                workshop_id,
                "transcription",
                f"Chunk {done}/{total} transcribed",
            )
            chunk_db = SessionLocal()
            try:
                w = chunk_db.get(Workshop, workshop_id)
                if not w:
                    logger.warning(
                        "[workshop=%s] Chunk progress update skipped — row missing",
                        workshop_id,
                    )
                    return
                _set_status(
                    chunk_db, w, ProcessingStatus.TRANSCRIBING,
                    progress=_transcription_progress(done, total),
                )
            except Exception:
                logger.exception(
                    "[workshop=%s] Failed to update transcription progress (%s/%s)",
                    workshop_id,
                    done,
                    total,
                )
            finally:
                chunk_db.close()

        transcript = transcription_service.transcribe_chunks(
            chunk_paths,
            on_chunk_complete=on_chunk,
        )
        _log_stage(
            workshop_id,
            "transcription",
            "Transcription complete",
            elapsed_s=round(time.monotonic() - stage_started, 1),
            transcript_chars=len(transcript),
        )

        workshop = db.get(Workshop, workshop_id)
        if not workshop:
            mark_workshop_failed(workshop_id, "Workshop row disappeared after transcription.")
            return

        # --- Analyze ---
        stage_started = time.monotonic()
        _log_stage(workshop_id, "analysis", "Starting Groq LLM evaluation")
        _set_status(
            db, workshop, ProcessingStatus.ANALYZING,
            transcript=transcript,
            audio_path=str(audio_path.resolve()),
        )

        analysis = workshop_analysis_service.analyze_transcript(
            transcript=transcript,
            title=workshop.title,
            trainer=workshop.trainer,
        )
        _log_stage(
            workshop_id,
            "analysis",
            "LLM evaluation complete",
            elapsed_s=round(time.monotonic() - stage_started, 1),
            overall_score=analysis.get("overall_score"),
        )

        workshop = db.get(Workshop, workshop_id)
        if not workshop:
            mark_workshop_failed(workshop_id, "Workshop row disappeared after analysis.")
            return

        _set_status(
            db, workshop, ProcessingStatus.COMPLETED,
            progress=PROGRESS_COMPLETED,
            transcript=transcript,
            audio_path=str(audio_path.resolve()),
            overall_score=analysis["overall_score"],
            summary=analysis["executive_summary"],
            analysis_json=json.dumps(analysis),
            error_message="",
        )
        logger.info(
            "[workshop=%s] COMPLETED transcript_chars=%s overall_score=%s",
            workshop_id,
            len(transcript),
            analysis["overall_score"],
        )

    except (ffmpeg_service.FFmpegError, ValueError) as exc:
        _fail_workshop(db, workshop_id, exc, transcript=transcript)
    except transcription_service.TranscriptionError as exc:
        _fail_workshop(db, workshop_id, exc, transcript=transcript)
    except workshop_analysis_service.AnalysisError as exc:
        _fail_workshop(db, workshop_id, exc, transcript=transcript)
    except Exception as exc:  # pragma: no cover - defensive catch-all
        _fail_workshop(db, workshop_id, exc, transcript=transcript)
    finally:
        if created_chunks:
            _log_stage(workshop_id, "cleanup", "Removing temporary audio chunks", count=len(created_chunks))
            ffmpeg_service.delete_paths(created_chunks)
            try:
                chunks_dir = chunks_destination(workshop_id)
                if chunks_dir.exists() and not any(chunks_dir.iterdir()):
                    chunks_dir.rmdir()
            except OSError as exc:
                logger.warning("[workshop=%s] Chunk directory cleanup failed: %s", workshop_id, exc)
        db.close()
        _log_stage(workshop_id, "init", "Database session closed")


def serialize_status(workshop: Workshop) -> dict[str, object]:
    return {
        "workshop_id": workshop.id,
        "status": workshop.processing_status,
        "progress": workshop.progress,
        "error": workshop.error_message,
        "title": workshop.title,
        "trainer": workshop.trainer,
        "workshop_date": workshop.workshop_date.isoformat(),
        "has_transcript": bool(workshop.transcript),
        "has_analysis": bool(workshop.analysis_json),
        "overall_score": workshop.overall_score,
        "created_at": workshop.created_at,
        "updated_at": workshop.updated_at,
    }


def serialize_analysis(workshop: Workshop) -> dict[str, object]:
    analysis: dict[str, object] = {}
    if workshop.analysis_json:
        try:
            analysis = json.loads(workshop.analysis_json)
        except json.JSONDecodeError:
            logger.warning("Workshop %s has corrupt analysis_json", workshop.id)
    return {
        "title": workshop.title,
        "trainer": workshop.trainer,
        "transcript": workshop.transcript,
        "overall_score": workshop.overall_score,
        "summary": workshop.summary,
        "analysis": analysis,
    }

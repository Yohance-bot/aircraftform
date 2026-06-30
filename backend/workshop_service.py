"""Workshop upload + processing orchestration."""

from __future__ import annotations

import json
import logging
import re
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


def _transcription_progress(done: int, total: int) -> int:
    """Interpolate 30% → 90% while chunks are transcribed."""
    if total <= 0:
        return PROGRESS_TRANSCRIBING
    ratio = done / total
    return int(PROGRESS_EXTRACTING + ratio * (PROGRESS_TRANSCRIBING - PROGRESS_EXTRACTING))


def process_workshop(workshop_id: int) -> None:
    """Background pipeline: extract audio → transcribe → analyze → store results."""
    db = SessionLocal()
    chunk_paths: list[Path] = []
    created_chunks: list[Path] = []
    transcript = ""

    try:
        workshop = db.get(Workshop, workshop_id)
        if not workshop:
            logger.error("Workshop %s not found for processing", workshop_id)
            return

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

        # --- Extract audio ---
        _set_status(db, workshop, ProcessingStatus.EXTRACTING_AUDIO)
        ffmpeg_service.assert_ffmpeg_available()
        ffmpeg_service.validate_video_file(video_path)
        ffmpeg_service.extract_audio(video_path, audio_path)
        _set_status(db, workshop, ProcessingStatus.EXTRACTING_AUDIO, audio_path=str(audio_path.resolve()))

        # --- Chunk if needed ---
        chunk_paths = ffmpeg_service.split_audio_chunks(audio_path, chunks_dir)
        created_chunks = [
            p for p in chunk_paths
            if p.resolve() != audio_path.resolve()
        ]

        # --- Transcribe ---
        _set_status(db, workshop, ProcessingStatus.TRANSCRIBING)

        def on_chunk(done: int, total: int) -> None:
            chunk_db = SessionLocal()
            try:
                w = chunk_db.get(Workshop, workshop_id)
                if not w:
                    return
                _set_status(
                    chunk_db, w, ProcessingStatus.TRANSCRIBING,
                    progress=_transcription_progress(done, total),
                )
            finally:
                chunk_db.close()

        transcript = transcription_service.transcribe_chunks(
            chunk_paths,
            on_chunk_complete=on_chunk,
        )

        workshop = db.get(Workshop, workshop_id)
        if not workshop:
            return

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

        workshop = db.get(Workshop, workshop_id)
        if not workshop:
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
            "Workshop %s completed (transcript=%s chars, score=%s)",
            workshop_id, len(transcript), analysis["overall_score"],
        )

    except (ffmpeg_service.FFmpegError, ValueError) as exc:
        logger.exception("Workshop %s media processing failed: %s", workshop_id, exc)
        db.rollback()
        workshop = db.get(Workshop, workshop_id)
        if workshop:
            _set_status(db, workshop, ProcessingStatus.FAILED, error_message=str(exc))
    except transcription_service.TranscriptionError as exc:
        logger.exception("Workshop %s transcription failed: %s", workshop_id, exc)
        db.rollback()
        workshop = db.get(Workshop, workshop_id)
        if workshop:
            _set_status(
                db, workshop, ProcessingStatus.FAILED,
                error_message=str(exc),
                transcript=transcript or workshop.transcript,
            )
    except workshop_analysis_service.AnalysisError as exc:
        logger.exception("Workshop %s analysis failed: %s", workshop_id, exc)
        db.rollback()
        workshop = db.get(Workshop, workshop_id)
        if workshop:
            _set_status(
                db, workshop, ProcessingStatus.FAILED,
                error_message=str(exc),
                transcript=transcript or workshop.transcript,
            )
    except Exception as exc:  # pragma: no cover - defensive catch-all
        logger.exception("Workshop %s unexpected failure: %s", workshop_id, exc)
        db.rollback()
        workshop = db.get(Workshop, workshop_id)
        if workshop:
            _set_status(
                db, workshop, ProcessingStatus.FAILED,
                error_message=str(exc),
                transcript=transcript or workshop.transcript,
            )
    finally:
        if created_chunks:
            ffmpeg_service.delete_paths(created_chunks)
            try:
                chunks_dir = chunks_destination(workshop_id)
                if chunks_dir.exists() and not any(chunks_dir.iterdir()):
                    chunks_dir.rmdir()
            except OSError:
                pass
        db.close()


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

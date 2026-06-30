"""Admin API for workshop video upload and processing status."""

from __future__ import annotations

import logging
import os
from datetime import date

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from database import get_db
from services import ffmpeg_service
from workshop_models import ProcessingStatus
from workshop_service import (
    create_workshop_record,
    dispatch_workshop_pipeline,
    ensure_upload_dirs,
    get_workshop,
    serialize_analysis,
    serialize_status,
    video_destination,
)

logger = logging.getLogger("amc.workshop.router")

router = APIRouter(prefix="/api/admin/workshops", tags=["workshops"])

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")
MAX_VIDEO_BYTES = int(os.getenv("WORKSHOP_MAX_VIDEO_BYTES", str(2 * 1024 * 1024 * 1024)))  # 2 GB


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


async def _save_upload(upload: UploadFile, destination, workshop_id: int) -> int:
    """Stream upload to disk; returns bytes written."""
    size = 0
    logger.info("[workshop=%s][upload] Saving video to %s", workshop_id, destination)
    with destination.open("wb") as handle:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_VIDEO_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Video exceeds maximum size of {MAX_VIDEO_BYTES // (1024 * 1024)} MB.",
                )
            handle.write(chunk)
    logger.info("[workshop=%s][upload] Saved %s bytes", workshop_id, size)
    return size


@router.post("/upload", dependencies=[Depends(require_admin)])
async def upload_workshop(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    trainer: str = Form(...),
    workshop_date: date = Form(...),
    video: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Accept a workshop video and start background transcription."""
    logger.info(
        "[workshop][upload] Request received title=%r trainer=%r date=%s filename=%r",
        title,
        trainer,
        workshop_date,
        video.filename,
    )
    if not title.strip():
        raise HTTPException(status_code=400, detail="Title is required.")
    if not trainer.strip():
        raise HTTPException(status_code=400, detail="Trainer is required.")

    try:
        ffmpeg_service.validate_video_suffix(video.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not ffmpeg_service.ffmpeg_available():
        logger.error("[workshop][upload] Rejected — FFmpeg not available on PATH")
        raise HTTPException(
            status_code=503,
            detail="FFmpeg is not available on the server. Cannot process workshop videos.",
        )

    logger.info(
        "[workshop][upload] FFmpeg available (ffmpeg=%s, ffprobe=%s)",
        ffmpeg_service.ffmpeg_path(),
        ffmpeg_service.ffprobe_path(),
    )

    ensure_upload_dirs()

    # Create the DB row first so we have a stable ID for the filename.
    workshop = create_workshop_record(
        db,
        title=title,
        trainer=trainer,
        workshop_date=workshop_date,
        video_path="",
    )

    dest = video_destination(workshop.id, video.filename or "video.mp4")
    workshop_id = workshop.id
    logger.info("[workshop=%s][upload] Created DB record", workshop_id)
    try:
        written = await _save_upload(video, dest, workshop_id)
        if written == 0:
            raise HTTPException(status_code=400, detail="Uploaded video file is empty.")

        ffmpeg_service.validate_video_file(dest)

        workshop.uploaded_video_path = str(dest.resolve())
        db.commit()
        logger.info(
            "[workshop=%s][upload] Video committed to database path=%s",
            workshop_id,
            workshop.uploaded_video_path,
        )
    except HTTPException as exc:
        logger.warning(
            "[workshop=%s][upload] Validation failed: %s",
            workshop_id,
            exc.detail,
        )
        db.rollback()
        failed = db.get(Workshop, workshop_id)
        if failed:
            failed.processing_status = ProcessingStatus.FAILED
            failed.error_message = "Upload validation failed."
            db.commit()
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise
    except Exception as exc:
        logger.exception("Workshop upload failed for id=%s: %s", workshop_id, exc)
        db.rollback()
        failed = db.get(Workshop, workshop_id)
        if failed:
            failed.processing_status = ProcessingStatus.FAILED
            failed.error_message = str(exc)[:500]
            db.commit()
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to save uploaded video.") from exc
    finally:
        await video.close()

    background_tasks.add_task(dispatch_workshop_pipeline, workshop_id)
    logger.info(
        "[workshop=%s][upload] Queued pipeline via BackgroundTasks; returning response",
        workshop_id,
    )

    return {
        "success": True,
        "workshop_id": workshop_id,
        "status": "processing",
    }


@router.get("/{workshop_id}/status", dependencies=[Depends(require_admin)])
def workshop_status(workshop_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    workshop = get_workshop(db, workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    data = serialize_status(workshop)
    logger.debug(
        "[workshop=%s][status] status=%s progress=%s",
        workshop_id,
        data["status"],
        data["progress"],
    )
    return {
        "status": data["status"],
        "progress": data["progress"],
        "workshop_id": data["workshop_id"],
        "error": data["error"],
        "has_transcript": data["has_transcript"],
        "has_analysis": data["has_analysis"],
    }


@router.get("/{workshop_id}/analysis", dependencies=[Depends(require_admin)])
def workshop_analysis(workshop_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    workshop = get_workshop(db, workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    if workshop.processing_status == ProcessingStatus.FAILED:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Workshop processing failed.",
                "error": workshop.error_message,
                "status": workshop.processing_status,
            },
        )
    if workshop.processing_status != ProcessingStatus.COMPLETED:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Analysis is not ready yet.",
                "status": workshop.processing_status,
                "progress": workshop.progress,
            },
        )
    if not workshop.analysis_json:
        raise HTTPException(status_code=404, detail="Analysis data is not available.")
    return serialize_analysis(workshop)

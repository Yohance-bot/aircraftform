"""FFmpeg helpers for workshop video → audio extraction and chunking."""

from __future__ import annotations

import logging
import math
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger("amc.ffmpeg")

# Groq Speech-to-Text upload limit (25 MB per file).
GROQ_MAX_BYTES = int(25 * 1024 * 1024)
# Plan chunks below the hard limit so re-encoded WAV segments stay under 25 MB.
CHUNK_TARGET_BYTES = int(GROQ_MAX_BYTES * 0.90)

ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mpeg", ".mpg"}


class FFmpegError(RuntimeError):
    """Raised when FFmpeg/FFprobe is missing or a media operation fails."""


def ffmpeg_available() -> bool:
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def ffmpeg_path() -> str | None:
    return shutil.which("ffmpeg")


def ffprobe_path() -> str | None:
    return shutil.which("ffprobe")


def assert_ffmpeg_available() -> None:
    if not ffmpeg_available():
        raise FFmpegError(
            "FFmpeg is not installed or not on PATH. "
            "Install ffmpeg and ffprobe to process workshop videos."
        )


def validate_video_suffix(filename: str | None) -> None:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        allowed = ", ".join(sorted(ALLOWED_VIDEO_SUFFIXES))
        raise ValueError(f"Unsupported video format '{suffix or 'unknown'}'. Allowed: {allowed}")


def validate_video_file(path: Path) -> None:
    """Ensure the uploaded file exists, is non-empty, and is readable by ffprobe."""
    logger.info("[ffmpeg] Validating video file %s", path)
    if not path.exists():
        raise ValueError("Uploaded video file was not saved.")
    if path.stat().st_size == 0:
        raise ValueError("Uploaded video file is empty.")

    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_type",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    logger.info("[ffmpeg] Running ffprobe validation: %s", " ".join(cmd))
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown error").strip()[:400]
        logger.error("[ffmpeg] ffprobe validation failed (rc=%s): %s", result.returncode, detail)
        raise ValueError(f"Invalid or corrupted video file: {detail}")
    logger.info("[ffmpeg] Video validation passed")


def get_duration_seconds(path: Path) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    logger.info("[ffmpeg] Probing duration: %s", path.name)
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        detail = (result.stderr or "")[:300]
        logger.error("[ffmpeg] Duration probe failed: %s", detail)
        raise FFmpegError(f"Could not read audio duration: {detail}")
    try:
        duration = float(result.stdout.strip())
        logger.info("[ffmpeg] Audio duration %.2fs", duration)
        return duration
    except ValueError as exc:
        raise FFmpegError("Could not parse audio duration.") from exc


def extract_audio(video_path: Path, audio_path: Path) -> Path:
    """Extract mono 16 kHz PCM audio from a video file."""
    assert_ffmpeg_available()
    audio_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        str(audio_path),
    ]
    logger.info("[ffmpeg] Extracting audio: %s -> %s", video_path.name, audio_path.name)
    logger.info("[ffmpeg] Command: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        stderr = (result.stderr or "")[:500]
        logger.error("[ffmpeg] Audio extraction failed (rc=%s): %s", result.returncode, stderr)
        raise FFmpegError(f"Audio extraction failed: {stderr}")

    if not audio_path.exists() or audio_path.stat().st_size == 0:
        logger.error("[ffmpeg] Audio extraction produced an empty file")
        raise FFmpegError("Audio extraction produced an empty file.")

    logger.info(
        "[ffmpeg] Audio extraction succeeded (%s bytes)",
        audio_path.stat().st_size,
    )

    return audio_path


def split_audio_chunks(
    audio_path: Path,
    chunks_dir: Path,
    *,
    max_bytes: int = GROQ_MAX_BYTES,
) -> list[Path]:
    """Split audio into ordered chunks that each fit within Groq's upload limit."""
    assert_ffmpeg_available()
    chunks_dir.mkdir(parents=True, exist_ok=True)

    size = audio_path.stat().st_size
    if size <= max_bytes:
        logger.info("[ffmpeg] Audio fits in one chunk (%s bytes)", size)
        return [audio_path]

    duration = get_duration_seconds(audio_path)
    target_bytes = min(max_bytes, CHUNK_TARGET_BYTES)
    num_chunks = max(2, math.ceil(size / target_bytes))
    max_attempts = 20
    logger.info(
        "[ffmpeg] Audio requires chunking size=%s duration=%.1fs initial_chunks=%s target_bytes=%s",
        size,
        duration,
        num_chunks,
        target_bytes,
    )

    for attempt in range(max_attempts):
        if attempt > 0:
            delete_paths(list(chunks_dir.glob("chunk_*.wav")))

        chunk_duration = duration / num_chunks
        logger.info(
            "[ffmpeg] Splitting into %s chunks (~%.1fs each, attempt %s/%s)",
            num_chunks, chunk_duration, attempt + 1, max_attempts,
        )

        chunk_paths: list[Path] = []
        failed = False
        for index in range(num_chunks):
            start = index * chunk_duration
            chunk_path = chunks_dir / f"chunk_{index:04d}.wav"
            cmd = [
                "ffmpeg", "-y",
                "-ss", f"{start:.3f}",
                "-t", f"{chunk_duration:.3f}",
                "-i", str(audio_path),
                "-ac", "1",
                "-ar", "16000",
                "-c:a", "pcm_s16le",
                str(chunk_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
            if result.returncode != 0:
                stderr = (result.stderr or "")[:400]
                logger.error(
                    "[ffmpeg] Chunk %s split failed (rc=%s): %s",
                    index, result.returncode, stderr,
                )
                raise FFmpegError(
                    f"Chunk split failed at index {index}: {stderr}"
                )
            if not chunk_path.exists() or chunk_path.stat().st_size == 0:
                logger.error("[ffmpeg] Chunk %s is empty after split", index)
                raise FFmpegError(f"Chunk {index} is empty after split.")
            chunk_size = chunk_path.stat().st_size
            logger.info("[ffmpeg] Chunk %s written (%s bytes)", index, chunk_size)
            if chunk_size > max_bytes:
                failed = True
                logger.warning(
                    "[ffmpeg] Chunk %s is %s bytes (limit %s); increasing chunk count",
                    index, chunk_size, max_bytes,
                )
                break
            chunk_paths.append(chunk_path)

        if not failed and len(chunk_paths) == num_chunks:
            logger.info("[ffmpeg] Chunking succeeded with %s chunks", len(chunk_paths))
            return chunk_paths

        delete_paths(chunk_paths)
        num_chunks += 1

    raise FFmpegError("Could not split audio into chunks under the Groq upload size limit.")


def delete_paths(paths: list[Path]) -> None:
    for path in paths:
        try:
            if path.exists():
                path.unlink()
        except OSError as exc:
            logger.warning("Could not delete %s: %s", path, exc)

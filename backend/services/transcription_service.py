"""Groq Speech-to-Text transcription for workshop audio."""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Callable
from pathlib import Path

from services.ffmpeg_service import GROQ_MAX_BYTES

logger = logging.getLogger("amc.transcription")

WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo").strip()
MAX_RETRIES = max(1, int(os.getenv("GROQ_TRANSCRIBE_MAX_RETRIES", "3")))
RETRY_BASE_DELAY = float(os.getenv("GROQ_TRANSCRIBE_RETRY_DELAY", "2.0"))


class TranscriptionError(RuntimeError):
    """Raised when Groq transcription fails after retries."""


def _client():
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise TranscriptionError("GROQ_API_KEY is not configured.")
    from groq import Groq

    return Groq(api_key=api_key)


def _extract_text(result: object) -> str:
    if isinstance(result, str):
        return result.strip()
    text = getattr(result, "text", None)
    if text:
        return str(text).strip()
    return str(result).strip()


def transcribe_file(path: Path) -> str:
    """Transcribe a single audio chunk with retry/backoff."""
    if not path.exists():
        raise TranscriptionError(f"Audio file not found: {path}")
    chunk_bytes = path.stat().st_size
    if chunk_bytes == 0:
        raise TranscriptionError(f"Audio file is empty: {path}")
    if chunk_bytes > GROQ_MAX_BYTES:
        raise TranscriptionError(
            f"Audio chunk exceeds Groq upload limit ({chunk_bytes} bytes)."
        )

    logger.info(
        "[transcription] Transcribing %s (%s bytes, model=%s, max_retries=%s)",
        path.name,
        chunk_bytes,
        WHISPER_MODEL,
        MAX_RETRIES,
    )
    client = _client()
    last_error: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(
                "[transcription] API call attempt %s/%s for %s",
                attempt,
                MAX_RETRIES,
                path.name,
            )
            with path.open("rb") as audio_file:
                result = client.audio.transcriptions.create(
                    file=audio_file,
                    model=WHISPER_MODEL,
                    response_format="text",
                    language="en",
                    temperature=0.0,
                )
            text = _extract_text(result)
            if not text:
                raise TranscriptionError("Groq returned an empty transcript.")
            logger.info(
                "[transcription] Success for %s (%s chars on attempt %s)",
                path.name,
                len(text),
                attempt,
            )
            return text
        except TranscriptionError:
            raise
        except Exception as exc:  # pragma: no cover - network/API variability
            last_error = exc
            logger.exception(
                "[transcription] Attempt %s/%s failed for %s: %s",
                attempt,
                MAX_RETRIES,
                path.name,
                exc,
            )
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * attempt
                logger.info("[transcription] Retrying in %.1fs", delay)
                time.sleep(delay)

    raise TranscriptionError(
        f"Transcription failed after {MAX_RETRIES} attempts: {last_error}"
    )


def transcribe_chunks(
    chunk_paths: list[Path],
    *,
    on_chunk_complete: Callable[[int, int], None] | None = None,
) -> str:
    """Transcribe every chunk in order and merge into one transcript."""
    if not chunk_paths:
        raise TranscriptionError("No audio chunks to transcribe.")

    logger.info("[transcription] Starting batch transcription (%s chunks)", len(chunk_paths))
    parts: list[str] = []
    total = len(chunk_paths)

    for index, chunk_path in enumerate(chunk_paths, start=1):
        logger.info("[transcription] Processing chunk %s/%s (%s)", index, total, chunk_path.name)
        parts.append(transcribe_file(chunk_path))
        if on_chunk_complete:
            on_chunk_complete(index, total)

    merged = "\n\n".join(part for part in parts if part.strip())
    logger.info("[transcription] Batch complete (%s chars total)", len(merged))
    return merged

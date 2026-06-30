"""Groq LLM evaluation of workshop transcripts."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger("amc.workshop.analysis")

CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile").strip()
MAX_TRANSCRIPT_CHARS = int(os.getenv("WORKSHOP_ANALYSIS_MAX_TRANSCRIPT_CHARS", "28000"))

CATEGORIES = [
    "Communication",
    "Clarity",
    "Confidence",
    "Knowledge",
    "Structure",
    "Engagement",
    "Examples",
    "Audience Interaction",
    "Professionalism",
    "Delivery",
]


class AnalysisError(RuntimeError):
    """Raised when workshop AI evaluation fails after retries."""


def _client():
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise AnalysisError("GROQ_API_KEY is not configured.")
    from groq import Groq

    return Groq(api_key=api_key)


def _truncate_transcript(transcript: str) -> str:
    text = (transcript or "").strip()
    if len(text) <= MAX_TRANSCRIPT_CHARS:
        return text
    head = MAX_TRANSCRIPT_CHARS // 2
    tail = MAX_TRANSCRIPT_CHARS - head - 40
    return (
        text[:head]
        + "\n\n[... transcript truncated for analysis ...]\n\n"
        + text[-tail:]
    )


def _build_system_prompt() -> str:
    category_schema = ",\n    ".join(
        f'"{name}": {{"score": <1-10>, "reasoning": "<string>", "improvements": "<string>"}}'
        for name in CATEGORIES
    )
    return f"""You are an expert workshop and training evaluator for AMC Airmodelcrafts.

Evaluate the trainer's delivery based ONLY on the workshop transcript provided.

Reply with STRICT JSON only — no markdown, no prose outside the JSON object.

Required schema:
{{
  "categories": {{
    {category_schema}
  }},
  "overall_score": <number 1-10, one decimal allowed>,
  "executive_summary": "<2-4 sentence overview>",
  "strengths": ["<string>", ...],
  "weaknesses": ["<string>", ...],
  "recommendations": ["<actionable string>", ...]
}}

Rules:
- Every category must be present with score (integer 1-10), reasoning, and improvements.
- Base scores only on evidence from the transcript.
- Be specific and constructive; avoid generic praise.
- strengths, weaknesses, recommendations: each 2-5 items."""


def _build_user_prompt(*, title: str, trainer: str, transcript: str) -> str:
    return (
        f"Workshop title: {title}\n"
        f"Trainer: {trainer}\n\n"
        f"Transcript:\n{transcript}"
    )


def _extract_json_object(content: str) -> dict[str, Any] | None:
    if not content:
        return None
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Could not parse LLM JSON: %s", exc)
        return None


def _validate_category(entry: Any, name: str) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        logger.warning("Category %s is not an object", name)
        return None
    score = entry.get("score")
    if not isinstance(score, (int, float)) or not (1 <= float(score) <= 10):
        logger.warning("Category %s has invalid score: %s", name, score)
        return None
    reasoning = str(entry.get("reasoning") or "").strip()
    improvements = str(entry.get("improvements") or "").strip()
    if not reasoning or not improvements:
        logger.warning("Category %s missing reasoning or improvements", name)
        return None
    return {
        "score": int(round(float(score))),
        "reasoning": reasoning[:2000],
        "improvements": improvements[:2000],
    }


def validate_analysis(data: dict[str, Any]) -> dict[str, Any] | None:
    """Validate and normalise the LLM analysis payload."""
    if not isinstance(data, dict):
        return None

    raw_categories = data.get("categories")
    if not isinstance(raw_categories, dict):
        logger.warning("Missing or invalid 'categories' object")
        return None

    categories: dict[str, dict[str, Any]] = {}
    for name in CATEGORIES:
        validated = _validate_category(raw_categories.get(name), name)
        if validated is None:
            return None
        categories[name] = validated

    overall = data.get("overall_score")
    if not isinstance(overall, (int, float)) or not (1 <= float(overall) <= 10):
        logger.warning("Invalid overall_score: %s", overall)
        return None

    executive_summary = str(data.get("executive_summary") or "").strip()
    if not executive_summary:
        logger.warning("Missing executive_summary")
        return None

    def _string_list(key: str, *, min_items: int = 1, max_items: int = 8) -> list[str] | None:
        items = data.get(key)
        if not isinstance(items, list):
            logger.warning("'%s' must be a list", key)
            return None
        cleaned = [str(item).strip() for item in items if str(item).strip()]
        if len(cleaned) < min_items:
            logger.warning("'%s' has too few items", key)
            return None
        return cleaned[:max_items]

    strengths = _string_list("strengths", min_items=1)
    weaknesses = _string_list("weaknesses", min_items=1)
    recommendations = _string_list("recommendations", min_items=1)
    if strengths is None or weaknesses is None or recommendations is None:
        return None

    return {
        "categories": categories,
        "overall_score": round(float(overall), 1),
        "executive_summary": executive_summary[:4000],
        "strengths": strengths,
        "weaknesses": weaknesses,
        "recommendations": recommendations,
    }


def _call_groq(*, title: str, trainer: str, transcript: str) -> str:
    client = _client()
    messages = [
        {"role": "system", "content": _build_system_prompt()},
        {"role": "user", "content": _build_user_prompt(title=title, trainer=trainer, transcript=transcript)},
    ]
    logger.info(
        "[workshop.analysis] Calling Groq chat model=%s title=%r transcript_chars=%s",
        CHAT_MODEL,
        title,
        len(transcript),
    )
    try:
        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=4000,
            response_format={"type": "json_object"},
        )
    except TypeError:
        logger.info("[workshop.analysis] Retrying without response_format (older SDK)")
        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=4000,
        )
    except Exception as exc:
        msg = str(exc).lower()
        if "response_format" in msg:
            logger.info("[workshop.analysis] Retrying without response_format (API rejection)")
            try:
                response = client.chat.completions.create(
                    model=CHAT_MODEL,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=4000,
                )
            except Exception as retry_exc:
                logger.exception("[workshop.analysis] Groq chat completion failed on retry")
                raise AnalysisError(f"Groq chat completion failed: {retry_exc}") from retry_exc
        else:
            logger.exception("[workshop.analysis] Groq chat completion failed")
            raise AnalysisError(f"Groq chat completion failed: {exc}") from exc

    content = ""
    try:
        content = response.choices[0].message.content or ""
    except (AttributeError, IndexError, TypeError) as exc:
        logger.exception("[workshop.analysis] Unexpected Groq response shape")
        raise AnalysisError(f"Unexpected Groq response shape: {exc}") from exc

    if not content.strip():
        logger.error("[workshop.analysis] Groq returned empty content")
        raise AnalysisError("Groq returned an empty analysis response.")
    logger.info("[workshop.analysis] Groq response received (%s chars)", len(content))
    return content


def analyze_transcript(
    *,
    transcript: str,
    title: str,
    trainer: str,
) -> dict[str, Any]:
    """Run Groq evaluation with JSON validation; retries once on invalid JSON."""
    if not (transcript or "").strip():
        raise AnalysisError("Cannot analyze an empty transcript.")

    trimmed = _truncate_transcript(transcript)
    last_error = "JSON validation failed"

    for attempt in range(1, 3):
        logger.info(
            "[workshop.analysis] Evaluation attempt %s/2 title=%r transcript_chars=%s",
            attempt, title, len(trimmed),
        )
        try:
            raw_content = _call_groq(title=title, trainer=trainer, transcript=trimmed)
        except AnalysisError:
            raise
        except Exception as exc:  # pragma: no cover - network/API variability
            logger.exception("[workshop.analysis] Groq analysis call failed on attempt %s", attempt)
            if attempt == 2:
                raise AnalysisError(f"Groq analysis failed: {exc}") from exc
            continue

        parsed = _extract_json_object(raw_content)
        if parsed is None:
            last_error = "Response was not valid JSON"
            logger.warning("Attempt %s: %s", attempt, last_error)
            continue

        validated = validate_analysis(parsed)
        if validated is not None:
            logger.info(
                "[workshop.analysis] Validation succeeded overall_score=%s",
                validated["overall_score"],
            )
            return validated

        last_error = "JSON schema validation failed"
        logger.warning("Attempt %s: %s", attempt, last_error)

    raise AnalysisError(f"Analysis failed after 2 attempts: {last_error}")

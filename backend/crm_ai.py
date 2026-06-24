"""AI lead intelligence (Phase 3).

Uses the same Groq stack as groq_agent to derive, for a contact:
  - a one-line AI summary
  - intent tags (from the configured vocabulary)
  - sentiment (positive | neutral | negative)
  - a recommended next action

Everything degrades gracefully: with no GROQ_API_KEY (or on any error) we
fall back to a lightweight heuristic so the CRM still populates fields.
Results are persisted on the Conversation row and an ``ai_refreshed``
timeline event is logged.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from conversation_models import Conversation, Message
from crm_scoring import _DATE_PATTERNS, _PRICE_PATTERNS
from crm_service import get_setting, json_dumps, log_timeline

logger = logging.getLogger("amc.crm.ai")

_VALID_SENTIMENTS = {"positive", "neutral", "negative"}


def _make_client():
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from groq import AsyncGroq

        return AsyncGroq(api_key=api_key)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Failed to initialise AsyncGroq for CRM AI: %s", exc)
        return None


def _build_transcript(messages: list[Message], limit: int = 40) -> str:
    recent = messages[-limit:]
    lines = []
    for m in recent:
        who = {"parent": "Lead", "bot": "Bot", "admin": "Agent"}.get(m.sender, m.sender)
        lines.append(f"{who}: {m.body}")
    return "\n".join(lines)


def _heuristic(messages: list[Message], allowed_tags: list[str]) -> dict[str, Any]:
    """Cheap, deterministic fallback when the LLM is unavailable."""
    inbound = [m for m in messages if m.direction == "in"]
    joined = " ".join(m.body or "" for m in inbound)
    tags: list[str] = []
    if "Parent" in allowed_tags:
        tags.append("Parent")
    if _PRICE_PATTERNS.search(joined) and "Price Sensitive" in allowed_tags:
        tags.append("Price Sensitive")
    if "Workshop Lead" in allowed_tags and _DATE_PATTERNS.search(joined):
        tags.append("Workshop Lead")

    count = len(inbound)
    summary = (
        f"Lead with {count} message{'s' if count != 1 else ''}. "
        + ("Asked about pricing. " if _PRICE_PATTERNS.search(joined) else "")
        + ("Asked about dates/schedule. " if _DATE_PATTERNS.search(joined) else "")
    ).strip() or "New lead — not enough conversation to summarise yet."

    return {
        "summary": summary,
        "intent_tags": tags,
        "sentiment": "neutral",
        "recommendation": (
            "Reach out with a warm intro and share relevant camp/kit details."
        ),
    }


def _parse_llm_json(content: str) -> dict[str, Any] | None:
    if not content:
        return None
    # Strip markdown fences if present.
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text
        text = text.replace("json", "", 1).strip("` \n")
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        return None


async def generate_lead_intelligence(
    db: Session,
    phone: str,
    *,
    actor: str | None = None,
) -> dict[str, Any]:
    """Generate, persist and return AI intelligence for a contact."""
    conv = db.query(Conversation).filter(Conversation.phone == phone).first()
    if conv is None:
        return {}

    messages = (
        db.query(Message)
        .filter(Message.phone == phone)
        .order_by(Message.timestamp.asc())
        .all()
    )
    allowed_tags = get_setting(db, "intent_tags") or []

    client = _make_client()
    result: dict[str, Any] | None = None

    if client is not None and messages:
        transcript = _build_transcript(messages)
        system = (
            "You are a CRM analyst for AMC Airmodelcrafts (aeromodelling camps "
            "and RC/drone kits in Bangalore). Analyse the conversation and reply "
            "with STRICT JSON only, no prose. Schema: {\"summary\": string (<=200 "
            "chars, factual), \"intent_tags\": string[] (choose only from the "
            f"allowed list: {allowed_tags}), \"sentiment\": one of "
            "[positive, neutral, negative], \"recommendation\": string (one "
            "concrete next action for the sales agent)}."
        )
        try:
            resp = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Conversation:\n{transcript}"},
                ],
                max_tokens=400,
                temperature=0.2,
            )
            parsed = _parse_llm_json(resp.choices[0].message.content or "")
            if parsed:
                result = parsed
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("CRM AI generation failed for %s: %s", phone, exc)

    if result is None:
        result = _heuristic(messages, allowed_tags)

    # Sanitise / clamp.
    summary = str(result.get("summary") or "").strip()[:500]
    tags = [t for t in (result.get("intent_tags") or []) if t in allowed_tags][:8]
    sentiment = str(result.get("sentiment") or "neutral").lower().strip()
    if sentiment not in _VALID_SENTIMENTS:
        sentiment = "neutral"
    recommendation = str(result.get("recommendation") or "").strip()[:500]

    conv.ai_summary = summary or conv.ai_summary
    conv.intent_tags = json_dumps(tags)
    conv.sentiment = sentiment
    conv.ai_recommendation = recommendation or conv.ai_recommendation
    conv.ai_generated_at = datetime.utcnow()
    conv.updated_at = datetime.utcnow()

    log_timeline(
        db,
        phone,
        "ai_refreshed",
        "AI intelligence refreshed",
        actor=actor or "system",
        detail=summary[:200] or None,
        commit=False,
    )
    try:
        db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to persist AI intelligence for %s: %s", phone, exc)
        db.rollback()

    return {
        "summary": summary,
        "intent_tags": tags,
        "sentiment": sentiment,
        "recommendation": recommendation,
        "generated_at": conv.ai_generated_at,
    }


def find_inactive_contacts(db: Session, hours: int = 24, limit: int = 50) -> list[str]:
    """Phones with activity that have gone quiet — candidates for AI refresh.

    Used by the nightly batch / inactivity trigger.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(Conversation)
        .filter(
            Conversation.last_activity_at.isnot(None),
            Conversation.last_activity_at < cutoff,
        )
        .order_by(Conversation.heat_score.desc())
        .limit(limit)
        .all()
    )
    return [r.phone for r in rows]

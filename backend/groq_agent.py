"""Groq-backed RAG over the knowledge base, with optional registration personalisation.

The knowledge base is loaded from the database with 60-second caching.
Each question is sent to Llama 3.3 70B with a tight system prompt that
constrains answers to the knowledge content. When a registration_context
dict is supplied, the bot addresses the parent by name and tailors
answers to their child's batch.

Failure modes are all graceful — if ``GROQ_API_KEY`` is unset, the SDK
fails to import, or the API errors at runtime, we return the canned
fallback so the bot keeps replying.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

logger = logging.getLogger("amc.groq")

# Suffix appended to every successful Groq answer so parents always see
# how to reach the human team if the AI got something wrong.
AI_DISCLAIMER = (
    "\n\n_⚠️ AI-generated response — may not always be accurate. "
    "For confirmed info: 9953517691 / 8050312758_"
)

FALLBACK_ANSWER = (
    "I'm not sure about that — please contact us on 9953517691 or 8050312758 😊"
)

SYSTEM_PROMPT = """You are a helpful assistant for AMC Airmodelcrafts aeromodelling camps in Bangalore.

We run camps at TWO locations:

**Palm Meadows (10-day camp):**
- Summer Camp: Ages 10-14, Rs 11,999, 20 Apr-1 May, 10AM-12PM
- Summer Workshop: Ages 5-9, Rs 7,499, 4-15 May, 10AM-12PM

**Prestige White Meadows (5-day camp):**
- Ages 6-14, 5-day camp
- Batches: 25-29 May, 1-5 June
- Timing slots: 9-11 AM or 3-5 PM

Answer ONLY from the knowledge base provided. Be concise — 2-3 sentences max. No filler phrases. Just answer the question directly and warmly.

IMPORTANT: If the user's context shows their society (palm-meadows or prestige-white-meadows), give them info specific to their camp location. If no society is shown, mention both options.

Rules:
1. Answer only from provided knowledge base
2. 2-3 sentences maximum — no fluff
3. Never make up prices, dates or facts
4. For refunds, complaints or medical needs direct to: 9953517691 / 8050312758
5. If answer not in knowledge base, say: "I'm not sure about that — please contact us on 9953517691 or 8050312758 😊"
"""

UNREGISTERED_BLOCK = """
UNREGISTERED USER:
This parent has not registered yet or messaged from a different number. Give general answers covering both batches and encourage them to register.
"""

# Knowledge cache (60 second TTL)
_knowledge_cache_value: str = ""
_knowledge_cache_time: float = 0
_KNOWLEDGE_CACHE_TTL = 60.0


def _load_faq_from_file() -> str:
    """Fallback: load from faq_knowledge.txt file."""
    path = Path(__file__).with_name("faq_knowledge.txt")
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.error("Could not load faq_knowledge.txt: %s", exc)
        return ""


async def _load_knowledge_from_db() -> str:
    """Fetch all knowledge entries from DB and combine into one text blob.

    Results are cached for 60 seconds to avoid hitting DB on every message.
    Falls back to reading faq_knowledge.txt if DB query fails or returns empty.
    """
    global _knowledge_cache_value, _knowledge_cache_time

    now = time.time()
    if _knowledge_cache_value and (now - _knowledge_cache_time) < _KNOWLEDGE_CACHE_TTL:
        return _knowledge_cache_value

    try:
        from database import SessionLocal
        from conversation_models import KnowledgeEntry

        db = SessionLocal()
        try:
            entries = (
                db.query(KnowledgeEntry)
                .order_by(KnowledgeEntry.created_at.asc())
                .all()
            )
            if entries:
                text_parts = []
                for entry in entries:
                    text_parts.append(f"## {entry.title}\n{entry.content}\n")
                _knowledge_cache_value = "\n".join(text_parts)
                _knowledge_cache_time = now
                return _knowledge_cache_value
        finally:
            db.close()
    except Exception as exc:
        logger.exception("Failed to load knowledge from DB: %s", exc)

    # Fallback to file
    _knowledge_cache_value = _load_faq_from_file()
    _knowledge_cache_time = now
    return _knowledge_cache_value


def _make_client():
    """Lazily build an AsyncGroq client. Returns None if unavailable."""
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from groq import AsyncGroq

        return AsyncGroq(api_key=api_key)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Failed to initialise AsyncGroq: %s", exc)
        return None


def _build_personalisation_block(registration_context: dict | None) -> str:
    """Render the per-parent context block prepended to the LLM user message."""
    if not registration_context:
        return UNREGISTERED_BLOCK

    parent_name = registration_context.get("parent_name") or "there"
    child_name = registration_context.get("child_name") or "your child"
    age_group = registration_context.get("age_group") or "unspecified"
    class_grade = registration_context.get("class_grade") or "unspecified"
    batch = registration_context.get("batch_preference") or "unspecified"
    payment = registration_context.get("payment_status") or "pending"
    society = registration_context.get("society") or "unspecified"
    timing_slot = registration_context.get("timing_slot") or "unspecified"

    # Determine location name
    if society == "palm-meadows":
        location = "Palm Meadows (10-day camp)"
    elif society == "prestige-white-meadows":
        location = "Prestige White Meadows (5-day camp)"
    else:
        location = "unspecified location"

    return (
        "\nREGISTERED PARENT CONTEXT (use this to personalise):\n"
        f"- Parent name: {parent_name}\n"
        f"- Child name: {child_name}\n"
        f"- Child age group: {age_group}\n"
        f"- Child grade: {class_grade}\n"
        f"- Registered batch: {batch}\n"
        f"- Payment status: {payment}\n"
        f"- Society/Location: {location}\n"
        f"- Timing slot: {timing_slot}\n\n"
        f"Use the child's name and society to give specific, relevant answers. "
        f"For example if they ask about schedule, tell them specifically about "
        f"the {location} schedule. If they ask about price or location, "
        f"tell them their specific camp details.\n"
        f"Address the parent as {parent_name}.\n"
    )


async def groq_rag_answer(
    question: str,
    registration_context: dict | None = None,
) -> str:
    """Answer a free-text question using the knowledge base as the only source.

    When ``registration_context`` is provided, the bot personalises its
    answer with the parent's first name and child's details. Always
    returns a non-empty string. Never raises.
    """
    if not question or not question.strip():
        return FALLBACK_ANSWER

    client = _make_client()
    if client is None:
        logger.info("groq_rag_answer: no API key, returning fallback")
        return FALLBACK_ANSWER

    personalisation_block = _build_personalisation_block(registration_context)
    knowledge_content = await _load_knowledge_from_db()

    user_message = (
        f"{personalisation_block}\n"
        f"Knowledge Base:\n{knowledge_content}\n\n"
        f"Parent's question: {question.strip()}"
    )

    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=200,
            temperature=0.3,
        )
        content = (response.choices[0].message.content or "").strip()
        if not content:
            return FALLBACK_ANSWER
        return content + AI_DISCLAIMER
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Groq call failed: %s", exc)
        return FALLBACK_ANSWER

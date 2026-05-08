"""Groq-backed RAG over the camp FAQ, with optional registration personalisation.

The FAQ corpus is loaded once at module import. Each question is sent to
Llama 3.3 70B with a tight system prompt that constrains answers to the
FAQ content. When a registration_context dict is supplied, the bot
addresses the parent by name and tailors answers to their child's batch.

Failure modes are all graceful — if ``GROQ_API_KEY`` is unset, the SDK
fails to import, or the API errors at runtime, we return the canned
fallback so the bot keeps replying.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger("amc.groq")

# Suffix appended to every successful Groq answer so parents always see
# how to reach the human team if the AI got something wrong.
AI_DISCLAIMER = (
    "\n\n_⚠️ AI-generated response — may not always be accurate. "
    "For confirmed info: 9953517691 / 8050312758_"
)

FALLBACK_ANSWER = (
    "I'm not 100% sure about that one! 🤔 For accurate information "
    "please contact our team directly:\n"
    "📞 9953517691 or 8050312758\n"
    "They'll be happy to help! 😊"
)

SYSTEM_PROMPT = """You are a warm, knowledgeable assistant for AMC Airmodelcrafts — an aeromodelling camp for children at Palm Meadows Resort, Bangalore.

IMPORTANT: If you have a registered parent's context above, always:
1. Address the parent by their first name
2. Refer to their child by name
3. Answer based on their specific batch/age group
4. If payment is pending, gently mention it once

You have two batches:
- Summer Camp: Ages 10-14, Rs 11,999, 20 Apr-1 May
- Summer Workshop: Ages 5-9, Rs 7,499, 4-15 May

Rules:
1. Answer ONLY from the FAQ content provided
2. Keep answers under 4 sentences
3. Be warm, friendly and encouraging
4. End every response with a relevant emoji
5. Never make up prices, dates or facts
6. For refunds, complaints or medical needs, always direct to team: 9953517691 / 8050312758

FALLBACK (answer not in FAQ):
"I'm not 100% sure about that one! 🤔 For accurate information please contact our team directly:
📞 9953517691 or 8050312758
They'll be happy to help! 😊"
"""

UNREGISTERED_BLOCK = """
UNREGISTERED USER:
This parent has not registered yet or messaged from a different number. Give general answers covering both batches and encourage them to register.
"""


def _load_faq() -> str:
    path = Path(__file__).with_name("faq_knowledge.txt")
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.error("Could not load faq_knowledge.txt: %s", exc)
        return ""


FAQ_CONTENT = _load_faq()


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

    return (
        "\nREGISTERED PARENT CONTEXT (use this to personalise):\n"
        f"- Parent name: {parent_name}\n"
        f"- Child name: {child_name}\n"
        f"- Child age group: {age_group}\n"
        f"- Child grade: {class_grade}\n"
        f"- Registered batch: {batch}\n"
        f"- Payment status: {payment}\n\n"
        f"Use the child's name and age group to give specific, relevant answers. "
        f"For example if they ask about curriculum, tell them specifically what "
        f"{child_name} will learn based on their batch. If they ask about price, "
        f"tell them their specific batch price.\n"
        f"Address the parent as {parent_name}.\n"
    )


async def groq_rag_answer(
    question: str,
    registration_context: dict | None = None,
) -> str:
    """Answer a free-text question using the FAQ as the only source.

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

    user_message = (
        f"{personalisation_block}\n"
        f"FAQ Content:\n{FAQ_CONTENT}\n\n"
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

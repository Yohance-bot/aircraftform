"""WhatsApp webhook router: verification handshake + inbound message dispatch.

Meta sends:
  - GET  /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
  - POST /webhook/whatsapp with the JSON envelope of an incoming message.

The dispatcher logic lives in :func:`_dispatch_message` so that
``/api/test-bot`` (in :mod:`bot_router`) can reuse it.

At the start of every dispatch we run a single registration lookup
(:func:`get_registration_context`) and thread the result through every
sender that supports personalisation. ``None`` means "no registration on
file"; senders fall back to generic copy in that case.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from conversation_models import Conversation, Message
from database import get_db
from groq_agent import groq_rag_answer
from models import Registration
from registration_flow import (
    cancel_flow,
    handle_registration_step,
    start_registration_flow,
)
from whatsapp_messages import (
    handle_registration_check,
    send_back_to_menu_button,
    send_faq_answer,
    send_interactive_menu,
    send_payment_info,
    send_speak_to_us,
    send_text,
)

logger = logging.getLogger("amc.webhook")

router = APIRouter()

GREETINGS: set[str] = {
    "hi",
    "hello",
    "hey",
    "start",
    "help",
    "menu",
    "hii",
    "helo",
    "namaste",
    "hai",
}

# Maps the list-reply ID coming back from Meta to either an FAQ topic key
# (when the action is "send a canned FAQ answer") or to a sentinel handled
# inline below.
_LIST_REPLY_FAQ_TOPIC: dict[str, str] = {
    "schedule": "schedule",
    "what_to_bring": "bring",
    "age_eligibility": "age",
    "food": "food",
    "location": "location",
}


# ---------------------------------------------------------------------------
# Conversation tracking helpers
# ---------------------------------------------------------------------------


def _extract_message_body(message: dict) -> str:
    """Extract a human-readable body from any message type.

    For text messages, returns the text body. For interactive replies,
    returns a human readable label like "📋 Checked registration status".
    For other types, returns a bracketed type description.
    """
    try:
        msg_type = message.get("type", "unknown")

        if msg_type == "text":
            return (message.get("text") or {}).get("body", "[empty text]")

        if msg_type == "interactive":
            interactive = message.get("interactive") or {}
            interactive_type = interactive.get("type", "unknown")

            if interactive_type == "list_reply":
                selection = (interactive.get("list_reply") or {}).get("id", "unknown")
                labels = {
                    "register_child": "📝 Started registration flow",
                    "check_registration": "📋 Checked registration status",
                    "payment_info": "💳 Viewed payment info",
                    "speak_to_us": "📞 Requested to speak to team",
                    "schedule": "📅 Viewed schedule",
                    "what_to_bring": "🎒 Viewed what to bring",
                    "age_eligibility": "✈️ Viewed age & eligibility",
                    "food": "🍫 Viewed food info",
                    "location": "📍 Viewed location",
                }
                return labels.get(selection, f"[menu: {selection}]")

            if interactive_type == "button_reply":
                button = (interactive.get("button_reply") or {}).get("id", "unknown")
                labels = {
                    "back_to_menu": "🏠 Returned to main menu",
                }
                return labels.get(button, f"[button: {button}]")

            return f"[interactive: {interactive_type}]"

        return f"[{msg_type} message]"
    except Exception:
        return "[unknown message]"


def _upsert_conversation_and_save_message(
    phone: str,
    message_body: str,
    db: Session,
) -> tuple[Conversation | None, bool]:
    """Upsert Conversation row and save inbound Message.

    Returns (conversation, bot_paused). If an error occurs, returns
    (None, False) so the webhook can continue without crashing.

    If a Registration exists for this phone:
      - Copies parent_name and child_name to the Conversation
      - If bucket is new_enquiry, updates it to form_submitted
    """
    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()

        normalized = phone.replace("+", "").strip()
        if normalized.startswith("91") and len(normalized) == 12:
            normalized = normalized[2:]

        registration = None
        if normalized:
            registration = (
                db.query(Registration)
                .filter(Registration.phone.like(f"%{normalized}%"))
                .order_by(Registration.created_at.desc())
                .first()
            )

        if conv is None:
            conv = Conversation(
                phone=phone,
                parent_name=registration.parent_name if registration else None,
                child_name=registration.child_name if registration else None,
                bucket="form_submitted" if registration else "new_enquiry",
                bot_paused=False,
            )
            db.add(conv)
        else:
            conv.updated_at = datetime.utcnow()
            if registration:
                if not conv.parent_name:
                    conv.parent_name = registration.parent_name
                if not conv.child_name:
                    conv.child_name = registration.child_name
                if conv.bucket == "new_enquiry":
                    conv.bucket = "form_submitted"

        msg = Message(
            phone=phone,
            direction="in",
            body=message_body,
            sender="parent",
        )
        db.add(msg)
        db.commit()
        db.refresh(conv)

        return conv, conv.bot_paused
    except Exception as exc:
        logger.exception("Failed to save conversation/message for %s: %s", phone, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return None, False


def get_registration_context(phone: str, db: Session) -> dict | None:
    """Look up registration by phone and return a personalisation dict.

    Strips ``+`` and a leading ``91`` (when the result is 12 digits) so
    Meta's wa_id format and the DB's stored ``+91...`` format match by the
    last 10 digits. Returns ``None`` when no registration is found.

    The returned dict intentionally exposes ``parent_name`` as the parent's
    *first name only* (for friendliness in greetings) and keeps the full
    name under ``full_parent_name``.
    """
    if not phone:
        return None

    normalized = phone.replace("+", "").strip()
    if normalized.startswith("91") and len(normalized) == 12:
        normalized = normalized[2:]

    if not normalized:
        return None

    try:
        registrations = (
            db.query(Registration)
            .filter(Registration.phone.like(f"%{normalized}%"))
            .order_by(Registration.created_at.desc())
            .all()
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Registration lookup failed for phone=%s: %s", phone, exc)
        return None

    if not registrations:
        return None

    reg = registrations[0]
    full_name = (reg.parent_name or "").strip()
    first_name = full_name.split()[0] if full_name else ""

    return {
        "parent_name": first_name,
        "full_parent_name": full_name,
        "child_name": reg.child_name,
        "age_group": reg.age_group,
        "class_grade": reg.class_grade,
        "batch_preference": reg.batch_preference,
        "payment_status": reg.payment_status,
        "villa_flat": reg.villa_flat_number,
        "special_requirements": reg.special_requirements,
        "siblings": len(registrations) > 1,
        "sibling_count": len(registrations) - 1,
        "all_children": [r.child_name for r in registrations],
    }


async def _dispatch_message(message: dict, phone: str, db: Session) -> None:
    """Route a single incoming WhatsApp message to the correct sender.

    Shared between the live webhook and the admin Bot Tester. Any
    exception is caught and logged so neither caller crashes.
    """
    # Single lookup per inbound message; used by every personalisable
    # sender below. None means "no registration on file" -> generic copy.
    registration_context = get_registration_context(phone, db)

    # If message is text, check for active registration session first
    if message.get("type") == "text":
        text_body = (message.get("text") or {}).get("body", "")
        # Don't intercept greetings — let them reset to menu
        if text_body.strip().lower() not in GREETINGS:
            in_flow = await handle_registration_step(phone, text_body, db)
            if in_flow:
                return

    try:
        msg_type = message.get("type")

        if msg_type == "text":
            text = (message.get("text") or {}).get("body", "")
            normalized = text.strip().lower()

            if normalized in GREETINGS:
                await send_interactive_menu(phone, registration_context)
                return

            answer = await groq_rag_answer(
                text, registration_context=registration_context
            )
            await send_text(phone, answer)
            await send_back_to_menu_button(phone)
            return

        if msg_type == "interactive":
            interactive = message.get("interactive") or {}
            interactive_type = interactive.get("type")

            if interactive_type == "list_reply":
                selection_id = (interactive.get("list_reply") or {}).get("id", "")

                if selection_id == "register_child":
                    await start_registration_flow(phone, db)
                    return
                if selection_id == "check_registration":
                    await handle_registration_check(
                        phone, db, registration_context=registration_context
                    )
                    return
                if selection_id == "payment_info":
                    await send_payment_info(phone, registration_context)
                    return
                if selection_id == "speak_to_us":
                    await send_speak_to_us(phone)
                    return

                topic = _LIST_REPLY_FAQ_TOPIC.get(selection_id)
                if topic is not None:
                    await send_faq_answer(phone, topic, registration_context)
                    return

                logger.warning("Unhandled list_reply id=%r", selection_id)
                await send_interactive_menu(phone, registration_context)
                return

            if interactive_type == "button_reply":
                button_id = (interactive.get("button_reply") or {}).get("id", "")
                if button_id == "back_to_menu":
                    await send_interactive_menu(phone, registration_context)
                    return
                logger.warning("Unhandled button_reply id=%r", button_id)
                await send_interactive_menu(phone, registration_context)
                return

        # Anything else (image, audio, location, etc.) — show the menu so the
        # parent has a clear way forward.
        await send_interactive_menu(phone, registration_context)

    except Exception as exc:
        logger.exception("Dispatch error for phone=%s: %s", phone, exc)


@router.get("/webhook/whatsapp")
async def verify_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
):
    """Handshake endpoint Meta hits when you save the webhook URL."""
    expected = os.getenv("WEBHOOK_VERIFY_TOKEN", "").strip()
    if hub_verify_token and expected and hub_verify_token == expected and hub_challenge:
        return PlainTextResponse(hub_challenge)
    return Response(status_code=403)


@router.post("/webhook/whatsapp")
async def receive_message(request: Request, db: Session = Depends(get_db)):
    """Inbound message handler.

    Always returns ``{"status": "ok"}`` with HTTP 200, even on internal
    errors — Meta retries non-2xx responses, which we don't want.
    """
    try:
        data = await request.json()
        entry = (data.get("entry") or [{}])[0]
        changes = (entry.get("changes") or [{}])[0]
        value = changes.get("value") or {}
        messages = value.get("messages") or []

        if not messages:
            return {"status": "no messages"}

        message = messages[0]
        phone = message.get("from")
        if not phone:
            return {"status": "no from"}

        # --- Conversation tracking: upsert + save inbound message ---
        message_body = _extract_message_body(message)
        conv, bot_paused = _upsert_conversation_and_save_message(
            phone, message_body, db
        )

        # If bot is paused for this conversation, skip dispatch entirely
        if bot_paused:
            logger.info("Bot paused for %s, skipping dispatch", phone)
            return {"status": "ok"}

        await _dispatch_message(message, phone, db)
    except Exception as exc:
        logger.exception("Webhook error: %s", exc)

    return {"status": "ok"}

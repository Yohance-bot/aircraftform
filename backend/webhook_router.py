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

from admin_agent import handle_admin_message, is_admin_phone
from conversation_models import Conversation, Message
from crm_scoring import recompute_score
from crm_service import log_timeline, touch_activity
from delivery_service import handle_conversation_delivery_statuses
import marketing_service
from database import get_db
from groq_agent import FALLBACK_ANSWER, groq_rag_answer
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
    serialize_menu_for_storage,
)


logger = logging.getLogger("amc.webhook")

# Message sent when a conversation is escalated to a human rep.
ESCALATION_MESSAGE = (
    "Thank you for reaching out. 🙏\n\n"
    "Your query has been flagged and forwarded to our team. "
    "A representative will get in touch with you shortly — "
    "usually within a few hours during working hours.\n\n"
    "📞 For urgent matters: 7015410570 / 8050312758"
)

# Message sent when the AI cannot answer a question and escalates automatically.
AI_ESCALATION_MESSAGE = (
    "I appreciate your patience. This query falls outside what I'm "
    "able to assist with at the moment.\n\n"
    "I've flagged this conversation so a member of our team can follow up "
    "with you directly — you can expect to hear from us shortly.\n\n"
    "📞 For immediate assistance: 7015410570 / 8050312758"
)


def _save_bot_message(phone: str, body: str, db: Session) -> None:
    """Save an outbound bot message to the conversation history."""
    try:
        msg = Message(
            phone=phone,
            direction="out",
            body=body,
            sender="bot",
        )
        db.add(msg)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save bot message for {phone}: {e}")
        db.rollback()


def _auto_enroll_new_lead(phone: str, db: Session) -> None:  # type: ignore[empty-body]
    """Auto-enroll a brand-new lead into active 'new_lead' drip sequences."""
    from marketing_models import DripSequence
    from conversation_models import Conversation as _Conv

    conv = db.query(_Conv).filter(_Conv.phone == phone).first()
    if not conv:
        return
    seqs = (
        db.query(DripSequence)
        .filter(DripSequence.active.is_(True), DripSequence.trigger_type == "new_lead")
        .all()
    )
    for seq in seqs:
        if marketing_service.eligible(conv, seq):
            marketing_service.enroll(db, seq.id, phone)


def _crm_after_inbound(phone: str, db: Session, *, first_message: bool) -> None:
    """CRM side-effects for an inbound message: timeline + heat re-scoring.

    Wrapped so any failure here never breaks the bot's reply path.
    """
    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        if conv is None:
            return
        if first_message:
            log_timeline(db, phone, "conversation_started",
                         "Conversation started", actor="lead", commit=False)
        log_timeline(db, phone, "message_received", "Message received",
                     actor="lead", commit=False)
        touch_activity(db, conv, commit=False)
        db.commit()
        recompute_score(db, phone, actor="system")
        # Marketing automation: an inbound reply marks campaign replies and
        # halts any drip sequences configured to stop on reply (Phase 10/11).
        try:
            marketing_service.on_reply(db, phone)
            if first_message:
                _auto_enroll_new_lead(phone, db)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Marketing reply hook failed for %s: %s", phone, exc)
            db.rollback()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("CRM post-inbound processing failed for %s: %s", phone, exc)
        try:
            db.rollback()
        except Exception:
            pass


def _flag_conversation(phone: str, db: Session) -> None:
    """Set the conversation bucket to needs_followup."""
    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        if conv:
            conv.bucket = "needs_followup"
            conv.updated_at = datetime.utcnow()
            db.commit()
    except Exception as e:
        logger.error(f"Failed to flag conversation for {phone}: {e}")
        db.rollback()

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
                    "back_to_menu": "🏠 Main Menu",
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
        "society": reg.society,
        "timing_slot": reg.timing_slot,
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
                _save_bot_message(
                    phone, serialize_menu_for_storage(registration_context), db
                )
                return

            answer = await groq_rag_answer(
                text, registration_context=registration_context
            )
            if answer == FALLBACK_ANSWER:
                # AI couldn't answer — escalate to human and flag
                _flag_conversation(phone, db)
                await send_text(phone, AI_ESCALATION_MESSAGE)
                _save_bot_message(phone, AI_ESCALATION_MESSAGE, db)
            else:
                await send_text(phone, answer)
                _save_bot_message(phone, answer, db)
                await send_back_to_menu_button(phone)
            return

        if msg_type == "interactive":
            interactive = message.get("interactive") or {}
            interactive_type = interactive.get("type")

            if interactive_type == "list_reply":
                selection_id = (interactive.get("list_reply") or {}).get("id", "")

                if selection_id == "register_child":
                    await start_registration_flow(phone, db)
                    _save_bot_message(phone, "[Started registration flow]", db)
                    return
                if selection_id == "check_registration":
                    await handle_registration_check(
                        phone, db, registration_context=registration_context
                    )
                    _save_bot_message(phone, "[Sent registration status]", db)
                    return
                if selection_id == "payment_info":
                    await send_payment_info(phone, registration_context)
                    _save_bot_message(phone, "[Sent payment info]", db)
                    return
                if selection_id == "speak_to_us":
                    _flag_conversation(phone, db)
                    await send_text(phone, ESCALATION_MESSAGE)
                    _save_bot_message(phone, ESCALATION_MESSAGE, db)
                    return

                topic = _LIST_REPLY_FAQ_TOPIC.get(selection_id)
                if topic is not None:
                    await send_faq_answer(phone, topic, registration_context)
                    _save_bot_message(phone, f"[Sent FAQ: {topic}]", db)
                    return

                logger.warning("Unhandled list_reply id=%r", selection_id)
                await send_interactive_menu(phone, registration_context)
                _save_bot_message(
                    phone, serialize_menu_for_storage(registration_context), db
                )
                return

            if interactive_type == "button_reply":
                button_id = (interactive.get("button_reply") or {}).get("id", "")
                if button_id == "back_to_menu":
                    await send_interactive_menu(phone, registration_context)
                    _save_bot_message(
                        phone, serialize_menu_for_storage(registration_context), db
                    )
                    return
                logger.warning("Unhandled button_reply id=%r", button_id)
                await send_interactive_menu(phone, registration_context)
                _save_bot_message(
                    phone, serialize_menu_for_storage(registration_context), db
                )
                return

        # Anything else (image, audio, location, etc.) — show the menu so the
        # parent has a clear way forward.
        await send_interactive_menu(phone, registration_context)
        _save_bot_message(
            phone, serialize_menu_for_storage(registration_context), db
        )

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


async def _handle_inbound_messages(value: dict, db: Session) -> None:
    """Process standard inbound customer messages."""
    messages = value.get("messages") or []
    if not messages:
        return

    message = messages[0]
    phone = message.get("from")
    if not phone:
        return

    message_body = _extract_message_body(message)

    # Was this the contact's first-ever inbound message? (Drives the
    # "conversation started" timeline event below.)
    prior_inbound = (
        db.query(Message)
        .filter(Message.phone == phone, Message.direction == "in")
        .first()
        is not None
    )

    conv, bot_paused = _upsert_conversation_and_save_message(
        phone, message_body, db
    )

    _crm_after_inbound(phone, db, first_message=not prior_inbound)

    if bot_paused:
        logger.info("Bot paused for %s, skipping dispatch", phone)
        return

    if is_admin_phone(phone, db):
        if message.get("type") == "text":
            text = (message.get("text") or {}).get("body", "")
            logger.info("Admin message from %s: %s", phone, text[:50])
            try:
                response = await handle_admin_message(phone, text, db)
                await send_text(phone, response)
                _save_bot_message(phone, response, db)
            except Exception as exc:
                logger.exception("Admin agent error for %s: %s", phone, exc)
                await send_text(phone, "Sorry, something went wrong. Please try again.")
        else:
            await send_text(phone, "Please send text messages for admin commands.")
        return

    await _dispatch_message(message, phone, db)


@router.post("/webhook/whatsapp")
async def receive_message(request: Request, db: Session = Depends(get_db)):
    """Inbound webhook handler for WhatsApp Cloud API messages.

    Always returns ``{"status": "ok"}`` with HTTP 200, even on internal
    errors — Meta retries non-2xx responses, which we don't want.
    """
    try:
        data = await request.json()
        for entry in data.get("entry") or []:
            for change in entry.get("changes") or []:
                field = change.get("field", "messages")
                value = change.get("value") or {}

                if field == "messages":
                    # A "messages" change carries either inbound messages or
                    # delivery-status updates (delivered/read/failed).
                    if value.get("statuses"):
                        statuses = value.get("statuses") or []
                        try:
                            handle_conversation_delivery_statuses(db, statuses)
                        except Exception as exc:  # pragma: no cover - defensive
                            logger.warning("handle_conversation_delivery_statuses failed: %s", exc)
                        try:
                            marketing_service.handle_statuses(db, statuses)
                        except Exception as exc:  # pragma: no cover - defensive
                            logger.warning("handle_statuses failed: %s", exc)
                    if value.get("messages"):
                        await _handle_inbound_messages(value, db)
                else:
                    logger.info("Unhandled webhook field: %s", field)
    except Exception as exc:
        logger.exception("Webhook error: %s", exc)

    return {"status": "ok"}

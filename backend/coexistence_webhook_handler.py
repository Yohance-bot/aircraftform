"""Coexistence-specific webhook handlers.

Processes smb_message_echoes (messages sent from WhatsApp Business App)
and account_update (disconnect events). Historical import webhooks are
logged and ignored — only future messages are stored.
"""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from conversation_models import Conversation, Message
from onboarding_service import mark_account_disconnected

logger = logging.getLogger("amc.coexistence")


def _extract_echo_body(message: dict) -> str:
    msg_type = message.get("type", "unknown")
    if msg_type == "text":
        return (message.get("text") or {}).get("body", "[empty text]")
    if msg_type == "image":
        caption = (message.get("image") or {}).get("caption", "")
        return f"[image]{': ' + caption if caption else ''}"
    if msg_type == "document":
        filename = (message.get("document") or {}).get("filename", "document")
        return f"[document: {filename}]"
    if msg_type == "audio":
        return "[audio message]"
    if msg_type == "video":
        caption = (message.get("video") or {}).get("caption", "")
        return f"[video]{': ' + caption if caption else ''}"
    return f"[{msg_type} message]"


def _upsert_and_save_outbound(
    phone: str,
    body: str,
    db: Session,
    *,
    sender: str = "admin",
) -> None:
    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        now = datetime.utcnow()
        if not conv:
            conv = Conversation(phone=phone, last_seen=now)
            db.add(conv)
        else:
            conv.last_seen = now
            conv.updated_at = now

        msg = Message(
            phone=phone,
            direction="out",
            body=body,
            sender=sender,
        )
        db.add(msg)
        db.commit()
    except Exception as exc:
        logger.error("Failed to save echo message for %s: %s", phone, exc)
        db.rollback()


async def handle_message_echoes(value: dict, db: Session) -> None:
    """Mirror messages sent from the WhatsApp Business App into the CRM."""
    echoes = value.get("message_echoes") or value.get("messages") or []
    metadata = value.get("metadata") or {}
    phone_number_id = metadata.get("phone_number_id", "")

    for echo in echoes:
        to_phone = echo.get("to") or echo.get("from")
        if not to_phone:
            logger.warning(
                "smb_message_echoes missing recipient: phone_number_id=%s",
                phone_number_id,
            )
            continue

        body = _extract_echo_body(echo)
        logger.info(
            "Business App echo: to=%s phone_number_id=%s body=%s",
            to_phone,
            phone_number_id,
            body[:80],
        )
        _upsert_and_save_outbound(to_phone, body, db, sender="admin")


async def handle_history(value: dict, db: Session) -> None:
    """Historical sync webhooks are acknowledged but not imported."""
    metadata = value.get("metadata") or {}
    logger.info(
        "Ignoring history webhook (future messages only): phone_number_id=%s",
        metadata.get("phone_number_id"),
    )


async def handle_contacts_sync(value: dict, db: Session) -> None:
    """Contact sync webhooks are acknowledged but not imported."""
    metadata = value.get("metadata") or {}
    logger.info(
        "Ignoring smb_app_state_sync webhook: phone_number_id=%s",
        metadata.get("phone_number_id"),
    )


async def handle_account_update(value: dict, db: Session) -> None:
    """Handle WABA disconnect / partner removal events."""
    event = value.get("event")
    waba_id = str(value.get("waba_id") or value.get("id") or "")
    logger.info("account_update webhook: event=%s waba_id=%s", event, waba_id)

    disconnect_events = {"PARTNER_REMOVED", "ACCOUNT_DELETED", "DISABLED"}
    if event in disconnect_events:
        mark_account_disconnected(db, waba_id or None)

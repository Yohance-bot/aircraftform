"""Track WhatsApp delivery status for conversation messages."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from conversation_models import Message

logger = logging.getLogger("amc.delivery")


def handle_conversation_delivery_statuses(db: Session, statuses: list[dict]) -> None:
    """Apply Meta delivery webhooks to stored conversation messages."""
    changed = False
    for st in statuses or []:
        wamid = st.get("id")
        status = (st.get("status") or "").lower()
        recipient = st.get("recipient")

        if status == "failed":
            logger.error(
                "WhatsApp delivery failed to %s (wamid=%s): %s",
                recipient,
                wamid,
                st.get("errors"),
            )
        elif status in {"sent", "delivered", "read"}:
            logger.info(
                "WhatsApp delivery %s to %s (wamid=%s)",
                status,
                recipient,
                wamid,
            )

        if not wamid or status not in {"sent", "delivered", "read", "failed"}:
            continue

        msg = db.query(Message).filter(Message.wa_message_id == wamid).first()
        if not msg:
            continue

        rank = {"sent": 0, "delivered": 1, "read": 2, "failed": 3}
        current = msg.delivery_status or ""
        if status != "failed" and rank.get(status, 0) < rank.get(current, 0):
            continue

        if status == "failed":
            msg.delivery_status = "failed"
            errors = st.get("errors") or []
            if errors:
                err = errors[0]
                msg.delivery_error = (
                    err.get("title")
                    or err.get("message")
                    or err.get("error_data", {}).get("details")
                    or str(err)
                )
            else:
                msg.delivery_error = "Message could not be delivered"
        else:
            msg.delivery_status = status

        db.add(msg)
        changed = True

    if changed:
        try:
            db.commit()
        except Exception as exc:
            logger.warning("Failed to commit delivery status updates: %s", exc)
            db.rollback()

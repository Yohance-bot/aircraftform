"""Admin-only endpoint that lets the dashboard exercise the bot.

POST /api/test-bot
------------------

Body::

    {
      "message": "hi",                # what the user said
      "phone":   "919812345678",      # optional, defaults to a placeholder
      "dry_run": true                 # if true, captures payloads instead of
                                      #   POSTing to Meta
    }

For ``dry_run=true`` the response includes a ``captured`` array containing
the exact JSON payloads that *would* have been sent to Meta — handy for
QA without spamming a real number.

For ``dry_run=false`` the dispatcher runs normally and the messages are
delivered to ``phone`` via the live WhatsApp Cloud API.

Special syntax in ``message`` lets the admin simulate interactive replies::

    list:schedule          → simulate the user picking the "Schedule" row
    list:check_registration→ simulate "Check My Registration"
    button:back_to_menu    → simulate the back-to-menu button tap
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from webhook_router import _dispatch_message
from whatsapp_client import whatsapp_capture

logger = logging.getLogger("amc.bot_router")

router = APIRouter()


def _require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("ADMIN_KEY", "").strip()
    if not x_admin_key or not expected or x_admin_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


class TestBotRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    phone: str | None = Field(default=None, max_length=30)
    dry_run: bool = True


def _build_meta_message(raw: str) -> dict:
    """Translate the admin's free-text input into a Meta-shaped message dict.

    Recognises ``list:<id>`` and ``button:<id>`` prefixes for simulating
    interactive replies; everything else is treated as plain text.
    """
    text = raw.strip()
    lower = text.lower()

    if lower.startswith("list:"):
        list_id = text.split(":", 1)[1].strip()
        return {
            "type": "interactive",
            "interactive": {
                "type": "list_reply",
                "list_reply": {"id": list_id, "title": list_id},
            },
        }

    if lower.startswith("button:"):
        button_id = text.split(":", 1)[1].strip()
        return {
            "type": "interactive",
            "interactive": {
                "type": "button_reply",
                "button_reply": {"id": button_id, "title": button_id},
            },
        }

    return {"type": "text", "text": {"body": text}}


@router.post("/api/test-bot", dependencies=[Depends(_require_admin)])
async def test_bot(payload: TestBotRequest, db: Session = Depends(get_db)) -> dict:
    phone = (payload.phone or "919999999999").strip()
    message = _build_meta_message(payload.message)

    captured: list[dict] = []

    if payload.dry_run:
        token = whatsapp_capture.set(captured)
        try:
            await _dispatch_message(message, phone, db)
        finally:
            whatsapp_capture.reset(token)
    else:
        await _dispatch_message(message, phone, db)

    return {
        "status": "sent",
        "dry_run": payload.dry_run,
        "captured": captured,
    }

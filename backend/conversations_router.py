"""API router for admin conversation management.

All endpoints require the X-Admin-Key header for authentication,
matching the existing /api/registrations pattern.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from conversation_models import Conversation, Message
from database import get_db
from whatsapp_messages import send_text

logger = logging.getLogger("amc.conversations")

router = APIRouter()

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    """Dependency that enforces admin authentication via header."""
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


# ---------------------------------------------------------------------------
# Pydantic models for request/response
# ---------------------------------------------------------------------------


class ConversationOut(BaseModel):
    phone: str
    parent_name: str | None
    child_name: str | None
    bucket: str
    bot_paused: bool
    last_seen: datetime | None
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None
    unread_count: int = 0

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    phone: str
    direction: str
    body: str
    sender: str
    timestamp: datetime

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    conversation: ConversationOut
    messages: list[MessageOut]


class SendMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4096)


class UpdateBucketRequest(BaseModel):
    bucket: str = Field(..., min_length=1, max_length=50)


class PauseBotRequest(BaseModel):
    paused: bool


class BroadcastRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4096)
    phones: list[str] = Field(..., min_items=1)


class BroadcastResult(BaseModel):
    phone: str
    success: bool
    error: str | None = None


class BroadcastResponse(BaseModel):
    sent: int
    failed: int
    results: list[BroadcastResult]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/api/conversations",
    response_model=list[ConversationOut],
    dependencies=[Depends(require_admin)],
)
def list_conversations(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """Return all conversations with last_message and unread_count.

    Ordered by most recent message timestamp descending.
    """
    try:
        conversations = db.query(Conversation).all()

        result = []
        for conv in conversations:
            last_msg = (
                db.query(Message)
                .filter(Message.phone == conv.phone)
                .order_by(Message.timestamp.desc())
                .first()
            )

            unread_count = 0
            if conv.last_seen:
                unread_count = (
                    db.query(func.count(Message.id))
                    .filter(
                        Message.phone == conv.phone,
                        Message.direction == "in",
                        Message.timestamp > conv.last_seen,
                    )
                    .scalar()
                    or 0
                )
            else:
                unread_count = (
                    db.query(func.count(Message.id))
                    .filter(Message.phone == conv.phone, Message.direction == "in")
                    .scalar()
                    or 0
                )

            result.append(
                {
                    "phone": conv.phone,
                    "parent_name": conv.parent_name,
                    "child_name": conv.child_name,
                    "bucket": conv.bucket,
                    "bot_paused": conv.bot_paused,
                    "last_seen": conv.last_seen,
                    "created_at": conv.created_at,
                    "updated_at": conv.updated_at,
                    "last_message": last_msg.body if last_msg else None,
                    "unread_count": unread_count,
                    "_sort_ts": last_msg.timestamp if last_msg else conv.created_at,
                }
            )

        result.sort(key=lambda x: x["_sort_ts"], reverse=True)
        for r in result:
            del r["_sort_ts"]

        return result
    except Exception as exc:
        logger.exception("Error listing conversations: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load conversations.",
        )


@router.get(
    "/api/conversations/{phone}",
    response_model=ConversationDetail,
    dependencies=[Depends(require_admin)],
)
def get_conversation(phone: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Return full conversation with all messages. Updates last_seen."""
    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )

        conv.last_seen = datetime.utcnow()
        db.commit()
        db.refresh(conv)

        messages = (
            db.query(Message)
            .filter(Message.phone == phone)
            .order_by(Message.timestamp.asc())
            .all()
        )

        return {
            "conversation": {
                "phone": conv.phone,
                "parent_name": conv.parent_name,
                "child_name": conv.child_name,
                "bucket": conv.bucket,
                "bot_paused": conv.bot_paused,
                "last_seen": conv.last_seen,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
                "last_message": messages[-1].body if messages else None,
                "unread_count": 0,
            },
            "messages": messages,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error getting conversation %s: %s", phone, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load conversation.",
        )


@router.post(
    "/api/conversations/{phone}/send",
    dependencies=[Depends(require_admin)],
)
async def send_message_to_conversation(
    phone: str,
    payload: SendMessageRequest,
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    """Send a message to a conversation and save it."""
    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )

        await send_text(phone, payload.message)

        msg = Message(
            phone=phone,
            direction="out",
            body=payload.message,
            sender="admin",
        )
        db.add(msg)

        conv.updated_at = datetime.utcnow()
        db.commit()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error sending message to %s: %s", phone, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send message.",
        )


@router.patch(
    "/api/conversations/{phone}/bucket",
    response_model=ConversationOut,
    dependencies=[Depends(require_admin)],
)
def update_bucket(
    phone: str,
    payload: UpdateBucketRequest,
    db: Session = Depends(get_db),
) -> Conversation:
    """Update the bucket/status of a conversation."""
    valid_buckets = {
        "new_enquiry",
        "form_submitted",
        "payment_confirmed",
        "needs_followup",
        "not_interested",
        "waitlist",
    }
    if payload.bucket not in valid_buckets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket. Must be one of: {', '.join(sorted(valid_buckets))}",
        )

    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )

        conv.bucket = payload.bucket
        conv.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(conv)

        return conv
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error updating bucket for %s: %s", phone, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update bucket.",
        )


@router.patch(
    "/api/conversations/{phone}/pause-bot",
    response_model=ConversationOut,
    dependencies=[Depends(require_admin)],
)
def pause_bot(
    phone: str,
    payload: PauseBotRequest,
    db: Session = Depends(get_db),
) -> Conversation:
    """Pause or unpause the bot for a conversation."""
    try:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )

        conv.bot_paused = payload.paused
        conv.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(conv)

        return conv
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error updating bot_paused for %s: %s", phone, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update bot pause status.",
        )


@router.post(
    "/api/broadcast",
    response_model=BroadcastResponse,
    dependencies=[Depends(require_admin)],
)
async def broadcast_message(
    payload: BroadcastRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Send a message to multiple phones and save outgoing messages."""
    results: list[dict[str, Any]] = []
    sent = 0
    failed = 0

    for phone in payload.phones:
        try:
            await send_text(phone, payload.message)

            conv = db.query(Conversation).filter(Conversation.phone == phone).first()
            if conv:
                msg = Message(
                    phone=phone,
                    direction="out",
                    body=payload.message,
                    sender="admin",
                )
                db.add(msg)
                conv.updated_at = datetime.utcnow()

            sent += 1
            results.append({"phone": phone, "success": True, "error": None})
        except Exception as exc:
            failed += 1
            results.append({"phone": phone, "success": False, "error": str(exc)})
            logger.warning("Broadcast failed for %s: %s", phone, exc)

    try:
        db.commit()
    except Exception as exc:
        logger.exception("Failed to commit broadcast messages: %s", exc)

    return {"sent": sent, "failed": failed, "results": results}

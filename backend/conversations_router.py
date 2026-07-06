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

from conversation_models import AdminUser, Conversation, Message
from crm_service import log_timeline
from database import get_db
from marketing_service import build_tracked_body, create_campaign, personalise, record_send
from whatsapp_credentials import get_active_display_phone_digits
from whatsapp_messages import send_text, send_text_result, send_text_tracked, _to_meta_phone

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
    wa_message_id: str | None = None
    delivery_status: str | None = None
    delivery_error: str | None = None

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
    campaign_id: int | None = None


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

        normalized = _to_meta_phone(phone) or phone
        business_phone = get_active_display_phone_digits()
        if business_phone and normalized == business_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "This number is your business WhatsApp line. "
                    "Open the chat with your business contact on your personal "
                    "WhatsApp to see messages sent to your customer number."
                ),
            )

        ok, wa_error, wamid = await send_text_result(phone, payload.message)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=wa_error
                or "WhatsApp could not deliver the message. Check credentials and the 24-hour reply window.",
            )

        msg = Message(
            phone=phone,
            direction="out",
            body=payload.message,
            sender="admin",
            wa_message_id=wamid if wamid != "captured" else None,
            delivery_status="sent" if wamid and wamid != "captured" else None,
        )
        db.add(msg)

        conv.updated_at = datetime.utcnow()
        if not conv.bot_paused:
            conv.bot_paused = True
        log_timeline(db, phone, "message_sent", "Agent sent a message",
                     actor="admin", commit=False)
        db.commit()

        return {"success": True, "whatsapp_message_id": wamid}
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

    # Every broadcast is automatically recorded as a campaign so it shows up
    # in Campaign Analytics with per-recipient delivery tracking (Phase 11).
    campaign = create_campaign(
        db,
        name=f"Broadcast {datetime.utcnow():%d %b %H:%M}",
        type="broadcast",
        body=payload.message,
    )

    for phone in payload.phones:
        try:
            conv = db.query(Conversation).filter(Conversation.phone == phone).first()
            # Personalise + rewrite any links into per-recipient tracked links.
            body = personalise(payload.message, conv)
            body = build_tracked_body(db, body, campaign.id, phone)

            wamid = await send_text_tracked(phone, body)
            record_send(db, campaign.id, phone, wamid, ok=True, commit=False)

            if conv:
                msg = Message(
                    phone=phone,
                    direction="out",
                    body=payload.message,
                    sender="admin",
                )
                db.add(msg)
                conv.updated_at = datetime.utcnow()
                log_timeline(db, phone, "campaign_received",
                             "Received a broadcast", actor="admin", commit=False)

            sent += 1
            results.append({"phone": phone, "success": True, "error": None})
        except Exception as exc:
            failed += 1
            try:
                record_send(db, campaign.id, phone, None, ok=False, error=str(exc), commit=False)
            except Exception:
                pass
            results.append({"phone": phone, "success": False, "error": str(exc)})
            logger.warning("Broadcast failed for %s: %s", phone, exc)

    try:
        db.commit()
    except Exception as exc:
        logger.exception("Failed to commit broadcast messages: %s", exc)

    return {"sent": sent, "failed": failed, "results": results, "campaign_id": campaign.id}


# ---------------------------------------------------------------------------
# Admin User Management
# ---------------------------------------------------------------------------


class AdminUserOut(BaseModel):
    id: int
    phone: str
    name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class CreateAdminUserRequest(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)
    name: str = Field(..., min_length=1, max_length=200)


class UpdateAdminUserRequest(BaseModel):
    is_active: bool


@router.get(
    "/api/admin-users",
    response_model=list[AdminUserOut],
    dependencies=[Depends(require_admin)],
)
def list_admin_users(db: Session = Depends(get_db)) -> list[AdminUser]:
    """Return all admin users."""
    try:
        return db.query(AdminUser).order_by(AdminUser.created_at.desc()).all()
    except Exception as exc:
        logger.exception("Error listing admin users: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load admin users.",
        )


@router.post(
    "/api/admin-users",
    response_model=AdminUserOut,
    dependencies=[Depends(require_admin)],
)
def create_admin_user(
    payload: CreateAdminUserRequest,
    db: Session = Depends(get_db),
) -> AdminUser:
    """Create a new admin user."""
    try:
        # Normalize phone - strip + and spaces
        phone = payload.phone.strip().replace("+", "").replace(" ", "").replace("-", "")
        
        # Check if already exists
        existing = db.query(AdminUser).filter(AdminUser.phone == phone).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An admin user with this phone number already exists.",
            )

        admin = AdminUser(
            phone=phone,
            name=payload.name.strip(),
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        return admin
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error creating admin user: %s", exc)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create admin user.",
        )


@router.patch(
    "/api/admin-users/{admin_id}",
    response_model=AdminUserOut,
    dependencies=[Depends(require_admin)],
)
def update_admin_user(
    admin_id: int,
    payload: UpdateAdminUserRequest,
    db: Session = Depends(get_db),
) -> AdminUser:
    """Update an admin user's active status."""
    try:
        admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin user not found.",
            )

        admin.is_active = payload.is_active
        db.commit()
        db.refresh(admin)

        return admin
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error updating admin user %d: %s", admin_id, exc)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update admin user.",
        )


@router.delete(
    "/api/admin-users/{admin_id}",
    dependencies=[Depends(require_admin)],
)
def delete_admin_user(
    admin_id: int,
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    """Delete an admin user."""
    try:
        admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin user not found.",
            )

        db.delete(admin)
        db.commit()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error deleting admin user %d: %s", admin_id, exc)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete admin user.",
        )

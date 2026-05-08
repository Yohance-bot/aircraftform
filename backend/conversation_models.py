"""SQLAlchemy models for conversation tracking.

These models are separate from models.py to keep the registration
system untouched. The Conversation table tracks each WhatsApp phone
that has interacted with the bot, and Message stores the full chat
history for admin review.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Conversation(Base):
    """Tracks a single WhatsApp phone number's conversation state."""

    __tablename__ = "conversations"

    phone: Mapped[str] = mapped_column(String(20), primary_key=True)
    parent_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    child_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    bucket: Mapped[str] = mapped_column(
        String(50), nullable=False, default="new_enquiry"
    )
    bot_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Message(Base):
    """Stores individual messages in a conversation for audit trail."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(
        String(20), ForeignKey("conversations.phone"), nullable=False
    )
    direction: Mapped[str] = mapped_column(String(3), nullable=False)  # "in" or "out"
    body: Mapped[str] = mapped_column(Text, nullable=False)
    sender: Mapped[str] = mapped_column(String(20), nullable=False)  # "bot", "admin", "parent"
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

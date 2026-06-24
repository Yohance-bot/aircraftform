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
    """Tracks a single WhatsApp phone number's conversation state.

    This row doubles as the CRM "contact": besides the chat pipeline
    ``bucket`` it carries lead-management fields (heat score, lead status,
    AI intelligence, assignment, reminders). All CRM columns are nullable
    with sane defaults so existing deployments migrate cleanly.
    """

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

    # --- CRM / lead-management fields (Phase 1) ---------------------------
    # Product interest bucket, distinct from the pipeline ``bucket`` above.
    lead_bucket: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unclassified"
    )
    heat_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # JSON-encoded list of {rule, points} explaining the current score.
    score_reasons: Mapped[str | None] = mapped_column(Text, nullable=True)
    lead_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new"
    )
    # JSON-encoded list of strings.
    intent_tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentiment: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ai_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    assigned_to: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reminder_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reminder_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # JSON-encoded dict for child_age, city, school, interests, etc.
    custom_fields: Mapped[str | None] = mapped_column(Text, nullable=True)


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


class KnowledgeEntry(Base):
    """Stores knowledge base entries for the Groq RAG agent."""

    __tablename__ = "knowledge_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class AdminUser(Base):
    """Stores admin users who can manage conversations via WhatsApp."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

"""SQLAlchemy models for the CRM upgrade.

Kept separate from conversation_models.py so the registration/conversation
core stays readable. All tables share the same declarative ``Base`` and are
created on startup alongside the existing ones.

Lead-level fields (heat score, status, AI summary, etc.) live on the
``Conversation`` row itself — see conversation_models.py — because a
conversation is keyed by phone and already behaves as the contact record.
These tables cover the surrounding CRM objects: activity timeline, internal
notes, message templates and editable CRM settings.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class TimelineEvent(Base):
    """Unified activity feed for a contact (Phase 4).

    ``event_type`` is one of a known vocabulary (conversation_started,
    message_sent, message_received, bucket_changed, status_changed,
    score_changed, form_submitted, reminder_created, reminder_completed,
    campaign_received, campaign_clicked, converted, ai_refreshed,
    assigned, note_added). ``meta`` is an optional JSON blob.
    """

    __tablename__ = "crm_timeline_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    meta: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, index=True
    )


class LeadNote(Base):
    """Internal, staff-only note attached to a contact (Phase 14)."""

    __tablename__ = "crm_lead_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MessageTemplate(Base):
    """Reusable message template with variables and saved-reply shortcut (Phase 9).

    ``category`` is one of follow_up | broadcast | drip. ``body`` may contain
    {{variable}} placeholders. ``shortcut`` (e.g. "/julycamp") expands to the
    body in composer fields.
    """

    __tablename__ = "crm_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="follow_up")
    body: Mapped[str] = mapped_column(Text, nullable=False)
    shortcut: Mapped[str | None] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CrmSetting(Base):
    """Key/value store for editable CRM configuration (Phase 18).

    Holds JSON-encoded values for: sources, intent_tags, lead_statuses,
    scoring_rules, reminder_defaults, assignment list. Editable from the
    Settings UI without code changes.
    """

    __tablename__ = "crm_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

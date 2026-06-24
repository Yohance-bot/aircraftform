"""SQLAlchemy models for marketing automation (Phases 10-12).

Covers three subsystems, all sharing the project's single declarative Base:

  * Campaigns    — every broadcast/drip send is recorded as a campaign with
                   per-message delivery tracking and an event log.
  * Drip         — multi-step sequences, per-contact enrollments and a queue
                   of scheduled messages processed by the background scheduler.
  * Tracking     — per-recipient tracked links and recorded clicks.

These tables are created via ``Base.metadata.create_all`` on startup. They are
brand-new tables (no ALTER of existing tables), so migration is inherently
idempotent and identical on SQLite and PostgreSQL.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


# ---------------------------------------------------------------------------
# Campaign analytics (Phase 11)
# ---------------------------------------------------------------------------


class Campaign(Base):
    __tablename__ = "crm_campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="broadcast")  # broadcast | drip | targeted
    template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    audience_filters: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    sequence_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, index=True
    )


class CampaignMessage(Base):
    __tablename__ = "crm_campaign_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    wa_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="sent")  # sent|delivered|read|replied|failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CampaignEvent(Base):
    __tablename__ = "crm_campaign_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)  # sent|delivered|read|replied|failed|clicked
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Drip sequences (Phase 10)
# ---------------------------------------------------------------------------


class DripSequence(Base):
    __tablename__ = "crm_drip_sequences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")  # manual|new_lead|status|bucket
    bucket_filters: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    score_filters: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON {min,max}
    status_filters: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DripStep(Base):
    __tablename__ = "crm_drip_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sequence_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delay_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    stop_on_reply: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    stop_on_conversion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DripEnrollment(Base):
    __tablename__ = "crm_drip_enrollments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sequence_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # active|paused|completed|cancelled|stopped_reply|stopped_conversion
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ScheduledMessage(Base):
    __tablename__ = "crm_scheduled_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    enrollment_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    sequence_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    step_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    send_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    # pending|sent|failed|cancelled|skipped
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wa_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class DripLog(Base):
    """Execution log for drip automation (enroll, send, skip, stop, errors)."""

    __tablename__ = "crm_drip_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sequence_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    enrollment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    event: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


# ---------------------------------------------------------------------------
# Click tracking (Phase 12)
# ---------------------------------------------------------------------------


class TrackedLink(Base):
    __tablename__ = "crm_tracked_links"

    # Short opaque token used in /track/{id}.
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    click_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class TrackedClick(Base):
    __tablename__ = "crm_tracked_clicks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    link_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    clicked_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

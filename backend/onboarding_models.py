"""SQLAlchemy models for WhatsApp Business App coexistence onboarding."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class WhatsAppAccount(Base):
    """Stores the active WhatsApp Cloud API + Business App coexistence connection."""

    __tablename__ = "whatsapp_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    waba_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    phone_number_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    business_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    display_phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    business_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_business_info: Mapped[str | None] = mapped_column(Text, nullable=True)

    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_type: Mapped[str] = mapped_column(String(32), nullable=False, default="business")
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    coexistence_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_on_biz_app: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    platform_type: Mapped[str | None] = mapped_column(String(32), nullable=True)

    onboarding_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    sync_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="skipped"
    )
    webhook_subscribed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WhatsAppOnboardingSession(Base):
    """Audit trail for each coexistence onboarding attempt."""

    __tablename__ = "whatsapp_onboarding_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    whatsapp_account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("whatsapp_accounts.id"), nullable=True
    )

    meta_session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_step: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    waba_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_number_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    business_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="started")
    step_logs: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

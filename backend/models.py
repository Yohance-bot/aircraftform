"""SQLAlchemy models for the AMC registration backend."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Registration(Base):
    __tablename__ = "registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_name: Mapped[str] = mapped_column(String(200), nullable=False)
    child_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    age_group: Mapped[str] = mapped_column(String(50), nullable=False)
    class_grade: Mapped[str] = mapped_column(String(50), nullable=False)
    villa_flat_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    special_requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch_preference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

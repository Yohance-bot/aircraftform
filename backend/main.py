"""FastAPI entrypoint for the AMC registration backend."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from conversation_models import AdminUser, Base as ConvBase  # noqa: F401 — AdminUser ensures table is registered
from conversations_router import router as conversations_router
from crm_models import (  # noqa: F401 — ensures CRM tables are registered
    CrmSetting,
    LeadNote,
    MessageTemplate,
    TimelineEvent,
)
from crm_router import router as crm_router
from marketing_models import (  # noqa: F401 — ensures marketing tables are registered
    Campaign,
    CampaignEvent,
    CampaignMessage,
    DripEnrollment,
    DripLog,
    DripSequence,
    DripStep,
    ScheduledMessage,
    TrackedClick,
    TrackedLink,
)
from marketing_router import router as marketing_router
from tracking_router import router as tracking_router
from scheduler import start_scheduler
from workshop_service import ensure_upload_dirs
from services.ffmpeg_service import ffmpeg_available
from database import Base, engine, get_db
from knowledge_router import router as knowledge_router, seed_knowledge_if_empty
from models import Registration
from onboarding_models import (  # noqa: F401 — ensures tables are registered
    WhatsAppAccount,
    WhatsAppOnboardingSession,
)
from onboarding_router import router as onboarding_router
from registration_flow import RegistrationSession  # noqa: F401 — ensures table is registered
from workshop_models import Workshop  # noqa: F401 — ensures workshops table is registered
from workshop_router import router as workshop_router
from webhook_router import router as webhook_router
from bot_router import router as bot_router

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")

_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("amc.main")

AgeGroup = Literal["6-9 years", "10-14 years"]
PrestigeAgeGroup = Literal["Age 5-8", "Age 9-14"]
PWM_VALID_TIMING_SLOTS = {"10 AM - 12 PM"}

app = FastAPI(title="AMC Registration API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)
app.include_router(bot_router)
app.include_router(conversations_router)
app.include_router(knowledge_router)
app.include_router(onboarding_router)
app.include_router(crm_router)
app.include_router(marketing_router)
app.include_router(tracking_router)
app.include_router(workshop_router)


@app.on_event("startup")
async def start_drip_scheduler() -> None:
    """Launch the in-process drip scheduler loop (Phase 10)."""
    start_scheduler()


@app.on_event("startup")
def on_startup() -> None:
    """Create tables on startup if they don't already exist."""
    logger.info("Application startup — configuring workshop pipeline")
    Base.metadata.create_all(bind=engine)
    ConvBase.metadata.create_all(bind=engine)
    ensure_registration_columns()
    ensure_conversation_columns()
    ensure_crm_columns()
    ensure_onboarding_session_columns()
    ensure_workshop_columns()
    ensure_upload_dirs()
    logger.info("Workshop upload dirs ready; FFmpeg available=%s", ffmpeg_available())
    db = next(get_db())
    try:
        seed_knowledge_if_empty(db)
    finally:
        db.close()


def ensure_crm_columns() -> None:
    """Add CRM lead-management columns to the conversations table if missing.

    Idempotent and safe across SQLite and Postgres — each column is only
    added when absent, mirroring the existing migration helpers.
    """
    inspector = inspect(engine)
    if "conversations" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("conversations")}
    # (column name, DDL type with default) — kept nullable so old rows migrate.
    crm_columns = [
        ("lead_bucket", "VARCHAR(20) DEFAULT 'unclassified'"),
        ("heat_score", "INTEGER DEFAULT 0"),
        ("score_reasons", "TEXT"),
        ("lead_status", "VARCHAR(20) DEFAULT 'new'"),
        ("intent_tags", "TEXT"),
        ("ai_summary", "TEXT"),
        ("ai_recommendation", "TEXT"),
        ("sentiment", "VARCHAR(10)"),
        ("ai_generated_at", "TIMESTAMP"),
        ("source", "VARCHAR(20) DEFAULT 'other'"),
        ("assigned_to", "VARCHAR(200)"),
        ("last_activity_at", "TIMESTAMP"),
        ("reminder_at", "TIMESTAMP"),
        ("reminder_note", "TEXT"),
        ("reminder_completed", "BOOLEAN DEFAULT FALSE"),
        ("custom_fields", "TEXT"),
    ]
    with engine.begin() as conn:
        for name, ddl in crm_columns:
            if name not in existing:
                conn.execute(
                    text(f"ALTER TABLE conversations ADD COLUMN {name} {ddl}")
                )


def ensure_onboarding_session_columns() -> None:
    """Add token staging columns to whatsapp_onboarding_sessions if missing."""
    inspector = inspect(engine)
    if "whatsapp_onboarding_sessions" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("whatsapp_onboarding_sessions")}
    with engine.begin() as conn:
        if "pending_access_token" not in existing_columns:
            conn.execute(
                text("ALTER TABLE whatsapp_onboarding_sessions ADD COLUMN pending_access_token TEXT")
            )
        if "pending_token_meta" not in existing_columns:
            conn.execute(
                text("ALTER TABLE whatsapp_onboarding_sessions ADD COLUMN pending_token_meta TEXT")
            )
        if "token_exchanged_at" not in existing_columns:
            conn.execute(
                text(
                    "ALTER TABLE whatsapp_onboarding_sessions ADD COLUMN token_exchanged_at TIMESTAMP"
                )
            )


def ensure_workshop_columns() -> None:
    """Add AI analysis columns to workshops if missing (existing deployments)."""
    inspector = inspect(engine)
    if "workshops" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("workshops")}
    columns = [
        ("overall_score", "REAL"),
        ("summary", "TEXT"),
        ("analysis_json", "TEXT"),
    ]
    with engine.begin() as conn:
        for name, ddl in columns:
            if name not in existing:
                conn.execute(text(f"ALTER TABLE workshops ADD COLUMN {name} {ddl}"))


def ensure_conversation_columns() -> None:
    """Add bot_paused and bucket columns to conversations if missing (existing deployments)."""
    inspector = inspect(engine)
    if "conversations" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("conversations")}
    with engine.begin() as conn:
        if "bot_paused" not in existing_columns:
            conn.execute(
                text("ALTER TABLE conversations ADD COLUMN bot_paused BOOLEAN DEFAULT FALSE")
            )
        if "bucket" not in existing_columns:
            conn.execute(
                text("ALTER TABLE conversations ADD COLUMN bucket VARCHAR(50) DEFAULT 'new_enquiry'")
            )


def ensure_registration_columns() -> None:
    inspector = inspect(engine)
    if "registrations" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("registrations")}
    with engine.begin() as conn:
        if "phone_country_code" not in existing_columns:
            conn.execute(text("ALTER TABLE registrations ADD COLUMN phone_country_code VARCHAR(10)"))
        if "society" not in existing_columns:
            conn.execute(text("ALTER TABLE registrations ADD COLUMN society VARCHAR(100)"))
        if "timing_slot" not in existing_columns:
            conn.execute(text("ALTER TABLE registrations ADD COLUMN timing_slot VARCHAR(50)"))
        # Make email nullable for prestige form (PostgreSQL only)
        try:
            conn.execute(text("ALTER TABLE registrations ALTER COLUMN email DROP NOT NULL"))
        except Exception:
            pass  # SQLite doesn't support this, but that's okay


class RegistrationIn(BaseModel):
    parent_name: str = Field(..., min_length=1, max_length=200)
    child_name: str = Field(..., min_length=1, max_length=200)
    phone_country_code: str = Field(..., min_length=1, max_length=10)
    phone: str = Field(..., min_length=1, max_length=50)
    email: EmailStr
    age_group: AgeGroup
    class_grade: str = Field(..., min_length=1, max_length=50)
    villa_flat_number: str | None = Field(default=None, max_length=100)
    special_requirements: str | None = None
    batch_preference: str | None = Field(default=None, max_length=100)


class PrestigeRegistrationIn(BaseModel):
    parent_name: str = Field(..., min_length=1, max_length=200)
    child_name: str = Field(..., min_length=1, max_length=200)
    phone: str = Field(..., min_length=1, max_length=50)
    email: str | None = Field(default=None, max_length=200)
    timing_slot: str = Field(..., min_length=1, max_length=50)
    age_group: PrestigeAgeGroup
    class_grade: str = Field(..., min_length=1, max_length=50)
    batch_preference: str | None = Field(default=None, max_length=100)
    society: str = Field(default="prestige-white-meadows", max_length=100)


class RegistrationOut(BaseModel):
    id: int
    parent_name: str
    child_name: str
    phone_country_code: str | None
    phone: str
    email: str | None
    age_group: str
    class_grade: str
    villa_flat_number: str | None
    special_requirements: str | None
    batch_preference: str | None
    timing_slot: str | None
    society: str | None
    payment_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class RegisterResponse(BaseModel):
    success: bool
    message: str
    id: int


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/register", response_model=RegisterResponse)
def register(payload: RegistrationIn, db: Session = Depends(get_db)) -> RegisterResponse:
    normalized_country_code = re.sub(r"\s+", "", payload.phone_country_code.strip())
    if not re.fullmatch(r"\+\d{1,4}", normalized_country_code):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select a valid country code.",
        )

    normalized_phone = re.sub(r"\s+", "", payload.phone.strip())
    if not re.fullmatch(r"\+\d{10,15}", normalized_phone):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Phone number must include country code and 10 to 15 digits.",
        )

    normalized_email = str(payload.email).strip().lower()
    if (
        ".." in normalized_email
        or normalized_email.startswith(".")
        or normalized_email.endswith(".")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid email address.",
        )

    record = Registration(
        parent_name=payload.parent_name.strip(),
        child_name=payload.child_name.strip(),
        phone_country_code=normalized_country_code,
        phone=normalized_phone,
        email=normalized_email,
        age_group=payload.age_group,
        class_grade=payload.class_grade.strip(),
        villa_flat_number=(payload.villa_flat_number or "").strip() or None,
        special_requirements=(payload.special_requirements or "").strip() or None,
        batch_preference=(payload.batch_preference or "").strip() or None,
        society="palm-meadows",
        payment_status="pending",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return RegisterResponse(
        success=True,
        message="Registration received. We'll reach out within 24 hours.",
        id=record.id,
    )


@app.post("/api/register-pwm", response_model=RegisterResponse)
def register_pwm(payload: PrestigeRegistrationIn, db: Session = Depends(get_db)) -> RegisterResponse:
    normalized_phone = re.sub(r"\s+", "", payload.phone.strip())
    if not re.fullmatch(r"\+\d{10,15}", normalized_phone):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Phone number must include country code and 10 to 15 digits.",
        )

    if payload.timing_slot not in PWM_VALID_TIMING_SLOTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select a valid timing slot.",
        )

    normalized_email = None
    if payload.email and payload.email.strip():
        normalized_email = payload.email.strip().lower()

    record = Registration(
        parent_name=payload.parent_name.strip(),
        child_name=payload.child_name.strip(),
        phone_country_code=None,
        phone=normalized_phone,
        email=normalized_email,
        age_group=payload.age_group,
        class_grade=payload.class_grade.strip(),
        timing_slot=payload.timing_slot,
        batch_preference=(payload.batch_preference or "").strip() or None,
        society=payload.society,
        payment_status="pending",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return RegisterResponse(
        success=True,
        message="Registration received! We'll be in touch soon.",
        id=record.id,
    )


@app.get(
    "/api/registrations",
    response_model=list[RegistrationOut],
    dependencies=[Depends(require_admin)],
)
def list_registrations(db: Session = Depends(get_db)) -> list[Registration]:
    return (
        db.query(Registration)
        .order_by(Registration.created_at.desc())
        .all()
    )


class RegistrationCreate(BaseModel):
    parent_name: str = Field(..., min_length=1, max_length=200)
    child_name: str = Field(..., min_length=1, max_length=200)
    phone: str = Field(..., min_length=1, max_length=50)
    phone_country_code: str | None = Field(default=None, max_length=10)
    email: str | None = Field(default=None, max_length=200)
    age_group: str = Field(default="TBD", max_length=50)
    class_grade: str = Field(default="TBD", max_length=50)
    villa_flat_number: str | None = Field(default=None, max_length=100)
    special_requirements: str | None = None
    batch_preference: str | None = Field(default=None, max_length=100)
    timing_slot: str | None = Field(default=None, max_length=50)
    society: str | None = Field(default=None, max_length=100)
    payment_status: str = Field(default="pending", max_length=30)


@app.post(
    "/api/registrations",
    response_model=RegistrationOut,
    dependencies=[Depends(require_admin)],
)
def create_registration(payload: RegistrationCreate, db: Session = Depends(get_db)) -> Registration:
    if payload.payment_status not in {"pending", "confirmed"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="payment_status must be pending or confirmed.",
        )

    phone = re.sub(r"\s+", "", payload.phone.strip())
    country = (payload.phone_country_code or "").strip()
    if country and not phone.startswith("+"):
        phone = re.sub(r"\s+", "", country) + phone.lstrip("0")

    record = Registration(
        parent_name=payload.parent_name.strip(),
        child_name=payload.child_name.strip(),
        phone_country_code=country or None,
        phone=phone,
        email=(payload.email or "").strip() or None,
        age_group=payload.age_group.strip() or "TBD",
        class_grade=payload.class_grade.strip() or "TBD",
        villa_flat_number=(payload.villa_flat_number or "").strip() or None,
        special_requirements=(payload.special_requirements or "").strip() or None,
        batch_preference=(payload.batch_preference or "").strip() or None,
        timing_slot=(payload.timing_slot or "").strip() or None,
        society=(payload.society or "").strip() or None,
        payment_status=payload.payment_status,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


class RegistrationUpdate(BaseModel):
    parent_name: str | None = Field(default=None, max_length=200)
    child_name: str | None = Field(default=None, max_length=200)
    phone_country_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=200)
    age_group: str | None = Field(default=None, max_length=50)
    class_grade: str | None = Field(default=None, max_length=50)
    villa_flat_number: str | None = Field(default=None, max_length=100)
    special_requirements: str | None = None
    batch_preference: str | None = Field(default=None, max_length=100)
    timing_slot: str | None = Field(default=None, max_length=50)
    society: str | None = Field(default=None, max_length=100)
    payment_status: str | None = Field(default=None, max_length=30)


@app.patch(
    "/api/registrations/{registration_id}",
    response_model=RegistrationOut,
    dependencies=[Depends(require_admin)],
)
def update_registration(
    registration_id: int,
    payload: RegistrationUpdate,
    db: Session = Depends(get_db),
) -> Registration:
    record = db.get(Registration, registration_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return record

    nullable_text = {
        "phone_country_code", "email", "villa_flat_number",
        "special_requirements", "batch_preference", "timing_slot", "society",
    }
    for key, value in updates.items():
        if key in nullable_text and isinstance(value, str) and not value.strip():
            setattr(record, key, None)
        elif isinstance(value, str):
            setattr(record, key, value.strip())
        else:
            setattr(record, key, value)

    if "payment_status" in updates and record.payment_status not in {"pending", "confirmed"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="payment_status must be pending or confirmed.",
        )

    db.commit()
    db.refresh(record)
    return record


@app.delete(
    "/api/registrations/{registration_id}",
    dependencies=[Depends(require_admin)],
)
def delete_registration(registration_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    record = db.get(Registration, registration_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")
    db.delete(record)
    db.commit()
    return {"success": True}

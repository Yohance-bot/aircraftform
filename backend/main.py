"""FastAPI entrypoint for the AMC registration backend."""

from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Registration

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")

AgeGroup = Literal["6-9 years", "10-14 years"]

app = FastAPI(title="AMC Registration API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Create tables on startup if they don't already exist."""
    Base.metadata.create_all(bind=engine)
    ensure_registration_columns()


def ensure_registration_columns() -> None:
    inspector = inspect(engine)
    if "registrations" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("registrations")}
    if "phone_country_code" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE registrations ADD COLUMN phone_country_code VARCHAR(10)"))


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


class RegistrationOut(BaseModel):
    id: int
    parent_name: str
    child_name: str
    phone_country_code: str | None
    phone: str
    email: str
    age_group: str
    class_grade: str
    villa_flat_number: str | None
    special_requirements: str | None
    batch_preference: str | None
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

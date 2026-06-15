"""API routes for WhatsApp Business App coexistence onboarding."""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from onboarding_service import (
    META_CONFIG_ID,
    OnboardingError,
    complete_onboarding,
    get_onboarding_status,
    record_cancellation,
)

logger = logging.getLogger("amc.onboarding.router")

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")
META_APP_ID = os.getenv("META_APP_ID", "").strip()
GRAPH_API_VERSION = os.getenv("META_GRAPH_API_VERSION", "v21.0").strip()


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


class SessionData(BaseModel):
    type: str | None = None
    event: str | None = None
    data: dict[str, Any] | None = None
    version: int | None = None


class CompleteOnboardingIn(BaseModel):
    code: str = Field(..., min_length=1)
    session_data: dict[str, Any]
    session_id: int | None = None


class CancelOnboardingIn(BaseModel):
    current_step: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    meta_session_id: str | None = None
    session_data: dict[str, Any] | None = None


class OnboardingConfigOut(BaseModel):
    app_id: str
    config_id: str
    graph_api_version: str


class AccountStatusOut(BaseModel):
    connected: bool
    onboarding_status: str | None = None
    sync_status: str | None = None
    waba_id: str | None = None
    phone_number_id: str | None = None
    business_id: str | None = None
    display_phone_number: str | None = None
    verified_name: str | None = None
    is_on_biz_app: bool | None = None
    platform_type: str | None = None
    coexistence_enabled: bool | None = None
    webhook_subscribed: bool | None = None
    updated_at: str | None = None
    latest_session: dict[str, Any] | None = None


@router.get("/config", response_model=OnboardingConfigOut)
def onboarding_config() -> OnboardingConfigOut:
    if not META_APP_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="META_APP_ID is not configured on the server.",
        )
    return OnboardingConfigOut(
        app_id=META_APP_ID,
        config_id=META_CONFIG_ID,
        graph_api_version=GRAPH_API_VERSION,
    )


@router.get(
    "/status",
    response_model=AccountStatusOut,
    dependencies=[Depends(require_admin)],
)
def onboarding_status(db: Session = Depends(get_db)) -> AccountStatusOut:
    return AccountStatusOut(**get_onboarding_status(db))


@router.post(
    "/complete",
    response_model=AccountStatusOut,
    dependencies=[Depends(require_admin)],
)
async def onboarding_complete(
    payload: CompleteOnboardingIn,
    db: Session = Depends(get_db),
) -> AccountStatusOut:
    logger.info("Onboarding complete request received")
    try:
        await complete_onboarding(
            db,
            code=payload.code.strip(),
            session_data=payload.session_data,
            existing_session_id=payload.session_id,
        )
    except OnboardingError as exc:
        logger.error("Onboarding failed: %s (%s)", exc.message, exc.code)
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "code": exc.code},
        ) from exc
    return AccountStatusOut(**get_onboarding_status(db))


@router.post("/cancel", dependencies=[Depends(require_admin)])
def onboarding_cancel(
    payload: CancelOnboardingIn,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    record_cancellation(
        db,
        current_step=payload.current_step,
        error_code=payload.error_code,
        error_message=payload.error_message,
        meta_session_id=payload.meta_session_id,
        session_data=payload.session_data,
    )
    return {"status": "cancelled"}

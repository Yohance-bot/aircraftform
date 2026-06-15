"""API routes for WhatsApp Business App coexistence onboarding."""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database import get_db
from onboarding_service import (
    META_CONFIG_ID,
    OnboardingError,
    complete_onboarding,
    get_onboarding_status,
    record_cancellation,
    stage_code_exchange,
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
    code: str | None = Field(default=None)
    staging_session_id: int | None = None
    session_data: dict[str, Any]
    session_id: int | None = None
    discover_assets: bool = False

    @model_validator(mode="after")
    def require_code_or_staging(self) -> "CompleteOnboardingIn":
        has_code = bool(self.code and self.code.strip())
        if not has_code and not self.staging_session_id:
            raise ValueError("Either code or staging_session_id is required.")
        return self


class ExchangeCodeIn(BaseModel):
    code: str = Field(..., min_length=1)
    redirect_uri: str | None = None
    redirect_uri_hints: list[str] | None = None


class ExchangeCodeOut(BaseModel):
    staging_session_id: int
    token_exchanged_at: str | None = None


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
    "/exchange-code",
    response_model=ExchangeCodeOut,
    dependencies=[Depends(require_admin)],
)
async def onboarding_exchange_code(
    payload: ExchangeCodeIn,
    db: Session = Depends(get_db),
) -> ExchangeCodeOut:
    logger.info(
        "POST /api/onboarding/exchange-code: code_len=%s hints=%s",
        len(payload.code.strip()),
        payload.redirect_uri_hints or ([payload.redirect_uri] if payload.redirect_uri else []),
    )
    hints = payload.redirect_uri_hints or []
    if payload.redirect_uri and payload.redirect_uri not in hints:
        hints = [payload.redirect_uri, *hints]
    try:
        session = await stage_code_exchange(db, payload.code.strip(), hints or None)
    except OnboardingError as exc:
        logger.error("Code exchange failed: %s (%s)", exc.message, exc.code)
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "code": exc.code},
        ) from exc
    exchanged_at = (
        session.token_exchanged_at.isoformat() if session.token_exchanged_at else None
    )
    logger.info("POST /api/onboarding/exchange-code succeeded: session_id=%s", session.id)
    return ExchangeCodeOut(
        staging_session_id=session.id,
        token_exchanged_at=exchanged_at,
    )


@router.post(
    "/complete",
    response_model=AccountStatusOut,
    dependencies=[Depends(require_admin)],
)
async def onboarding_complete(
    payload: CompleteOnboardingIn,
    db: Session = Depends(get_db),
) -> AccountStatusOut:
    session_event = payload.session_data.get("event")
    inner = payload.session_data.get("data") or {}
    logger.info(
        "POST /api/onboarding/complete: event=%s waba_id=%s phone_number_id=%s code_len=%s staging_session_id=%s discover_assets=%s",
        session_event,
        inner.get("waba_id"),
        inner.get("phone_number_id"),
        len(payload.code.strip()) if payload.code else 0,
        payload.staging_session_id,
        payload.discover_assets,
    )
    try:
        await complete_onboarding(
            db,
            code=payload.code.strip() if payload.code else None,
            session_data=payload.session_data,
            existing_session_id=payload.session_id,
            staging_session_id=payload.staging_session_id,
            discover_assets=payload.discover_assets,
        )
    except OnboardingError as exc:
        logger.error("Onboarding failed: %s (%s)", exc.message, exc.code)
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "code": exc.code},
        ) from exc
    logger.info("POST /api/onboarding/complete succeeded")
    return AccountStatusOut(**get_onboarding_status(db))


@router.post("/cancel", dependencies=[Depends(require_admin)])
def onboarding_cancel(
    payload: CancelOnboardingIn,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    logger.info(
        "POST /api/onboarding/cancel: step=%s error=%s event=%s",
        payload.current_step,
        payload.error_message,
        (payload.session_data or {}).get("event"),
    )
    record_cancellation(
        db,
        current_step=payload.current_step,
        error_code=payload.error_code,
        error_message=payload.error_message,
        meta_session_id=payload.meta_session_id,
        session_data=payload.session_data,
    )
    return {"status": "cancelled"}

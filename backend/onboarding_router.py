"""API routes for WhatsApp Cloud API credential setup."""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from onboarding_service import OnboardingError, get_onboarding_status, manual_connect_whatsapp

logger = logging.getLogger("amc.onboarding.router")

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


class ManualConnectIn(BaseModel):
    waba_id: str = Field(..., min_length=1)
    phone_number_id: str = Field(..., min_length=1)
    access_token: str = Field(..., min_length=1)
    business_id: str | None = None
    subscribe_webhooks: bool = True


class AccountStatusOut(BaseModel):
    connected: bool
    onboarding_status: str | None = None
    sync_status: str | None = None
    credential_source: str | None = None
    env_credentials_configured: bool = False
    env_waba_id: str | None = None
    env_phone_number_id: str | None = None
    waba_id: str | None = None
    phone_number_id: str | None = None
    business_id: str | None = None
    display_phone_number: str | None = None
    verified_name: str | None = None
    platform_type: str | None = None
    webhook_subscribed: bool | None = None
    updated_at: str | None = None
    latest_session: dict | None = None


@router.get(
    "/status",
    response_model=AccountStatusOut,
    dependencies=[Depends(require_admin)],
)
def onboarding_status(db: Session = Depends(get_db)) -> AccountStatusOut:
    return AccountStatusOut(**get_onboarding_status(db))


@router.post(
    "/manual",
    response_model=AccountStatusOut,
    dependencies=[Depends(require_admin)],
)
async def onboarding_manual_connect(
    payload: ManualConnectIn,
    db: Session = Depends(get_db),
) -> AccountStatusOut:
    logger.info(
        "POST /api/onboarding/manual: waba_id=%s phone_number_id=%s token_len=%s",
        payload.waba_id.strip(),
        payload.phone_number_id.strip(),
        len(payload.access_token.strip()),
    )
    try:
        await manual_connect_whatsapp(
            db,
            waba_id=payload.waba_id.strip(),
            phone_number_id=payload.phone_number_id.strip(),
            access_token=payload.access_token.strip(),
            business_id=payload.business_id.strip() if payload.business_id else None,
            subscribe_webhooks=payload.subscribe_webhooks,
        )
    except OnboardingError as exc:
        logger.error("Manual connect failed: %s (%s)", exc.message, exc.code)
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "code": exc.code},
        ) from exc
    return AccountStatusOut(**get_onboarding_status(db))


@router.post(
    "/manual/from-env",
    response_model=AccountStatusOut,
    dependencies=[Depends(require_admin)],
)
async def onboarding_manual_from_env(
    db: Session = Depends(get_db),
) -> AccountStatusOut:
    waba_id = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", "").strip()
    phone_number_id = os.getenv("PHONE_NUMBER_ID", "").strip()
    access_token = os.getenv("ACCESS_TOKEN", "").strip()
    logger.info(
        "POST /api/onboarding/manual/from-env: waba_id=%s phone_number_id=%s configured=%s",
        waba_id or "(missing)",
        phone_number_id or "(missing)",
        bool(access_token),
    )
    if not waba_id or not phone_number_id or not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Set PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, and ACCESS_TOKEN in backend/.env.",
                "code": "missing_env_credentials",
            },
        )
    try:
        await manual_connect_whatsapp(
            db,
            waba_id=waba_id,
            phone_number_id=phone_number_id,
            access_token=access_token,
        )
    except OnboardingError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"message": exc.message, "code": exc.code},
        ) from exc
    return AccountStatusOut(**get_onboarding_status(db))

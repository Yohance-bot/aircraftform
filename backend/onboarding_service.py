"""WhatsApp Cloud API credential management.

Supports manual credential setup from Meta API Setup (WABA ID, phone number
ID, access token) with optional webhook subscription.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from onboarding_models import WhatsAppAccount, WhatsAppOnboardingSession

logger = logging.getLogger("amc.onboarding")

GRAPH_API_VERSION = os.getenv("META_GRAPH_API_VERSION", "v21.0").strip()


class OnboardingError(Exception):
    """Raised when onboarding cannot proceed; carries an HTTP-friendly code."""

    def __init__(self, message: str, code: str = "onboarding_failed", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def _graph_url(path: str) -> str:
    return f"https://graph.facebook.com/{GRAPH_API_VERSION}/{path.lstrip('/')}"


async def _graph_get(path: str, token: str, params: dict | None = None) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(_graph_url(path), headers=headers, params=params or {})
    if response.status_code >= 400:
        raise OnboardingError(
            f"Meta API GET {path} failed ({response.status_code}): {response.text[:500]}",
            code="meta_api_error",
            status_code=502,
        )
    return response.json()


async def _graph_post(path: str, token: str, payload: dict | None = None) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(_graph_url(path), headers=headers, json=payload or {})
    if response.status_code >= 400:
        raise OnboardingError(
            f"Meta API POST {path} failed ({response.status_code}): {response.text[:500]}",
            code="meta_api_error",
            status_code=502,
        )
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text}


async def subscribe_waba(waba_id: str, token: str) -> None:
    result = await _graph_post(f"{waba_id}/subscribed_apps", token)
    if not result.get("success"):
        raise OnboardingError(
            "Failed to subscribe to WABA webhooks. Check app permissions.",
            code="missing_permissions",
            status_code=403,
        )


async def verify_phone_access(phone_number_id: str, token: str) -> dict[str, Any]:
    """Validate token can read the phone number (manual credential setup)."""
    return await _graph_get(
        phone_number_id,
        token,
        params={"fields": "display_phone_number,verified_name,platform_type"},
    )


async def manual_connect_whatsapp(
    db: Session,
    *,
    waba_id: str,
    phone_number_id: str,
    access_token: str,
    business_id: str | None = None,
    subscribe_webhooks: bool = True,
) -> WhatsAppAccount:
    """Save WhatsApp Cloud API credentials from Meta API Setup."""
    waba_id = waba_id.strip()
    phone_number_id = phone_number_id.strip()
    access_token = access_token.strip()

    if not waba_id or not phone_number_id or not access_token:
        raise OnboardingError(
            "WABA ID, phone number ID, and access token are required.",
            code="missing_credentials",
            status_code=400,
        )

    try:
        phone_info = await verify_phone_access(phone_number_id, access_token)
    except OnboardingError as exc:
        raise OnboardingError(
            f"Could not verify access token with Meta: {exc.message}",
            code="invalid_token",
            status_code=400,
        ) from exc

    webhook_subscribed = False
    if subscribe_webhooks:
        try:
            await subscribe_waba(waba_id, access_token)
            webhook_subscribed = True
        except OnboardingError as exc:
            logger.warning("Manual connect: webhook subscribe failed: %s", exc.message)

    existing = (
        db.query(WhatsAppAccount)
        .filter(WhatsAppAccount.waba_id == waba_id)
        .first()
    )
    if existing:
        account = existing
        account.phone_number_id = phone_number_id
        account.business_id = business_id
        account.access_token = access_token
        account.display_phone_number = phone_info.get("display_phone_number")
        account.verified_name = phone_info.get("verified_name")
        account.platform_type = phone_info.get("platform_type")
        account.coexistence_enabled = False
        account.is_on_biz_app = False
        account.webhook_subscribed = webhook_subscribed
        account.onboarding_status = "active"
        account.sync_status = "skipped"
        account.updated_at = datetime.utcnow()
    else:
        account = WhatsAppAccount(
            waba_id=waba_id,
            phone_number_id=phone_number_id,
            business_id=business_id,
            access_token=access_token,
            display_phone_number=phone_info.get("display_phone_number"),
            verified_name=phone_info.get("verified_name"),
            platform_type=phone_info.get("platform_type"),
            coexistence_enabled=False,
            is_on_biz_app=False,
            webhook_subscribed=webhook_subscribed,
            onboarding_status="active",
            sync_status="skipped",
            raw_business_info=json.dumps({"source": "manual_connect", "phone_info": phone_info}),
        )
        db.add(account)

    db.query(WhatsAppAccount).filter(
        WhatsAppAccount.id != account.id,
        WhatsAppAccount.is_active.is_(True),
    ).update({"is_active": False, "updated_at": datetime.utcnow()})

    account.is_active = True
    db.commit()
    db.refresh(account)
    logger.info(
        "Manual WhatsApp connect: waba_id=%s phone_number_id=%s display=%s",
        account.waba_id,
        account.phone_number_id,
        account.display_phone_number,
    )
    return account


def get_onboarding_status(db: Session) -> dict[str, Any]:
    account = (
        db.query(WhatsAppAccount)
        .filter(WhatsAppAccount.is_active.is_(True))
        .order_by(WhatsAppAccount.updated_at.desc())
        .first()
    )
    latest_session = (
        db.query(WhatsAppOnboardingSession)
        .order_by(WhatsAppOnboardingSession.created_at.desc())
        .first()
    )

    env_waba = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", "").strip()
    env_phone = os.getenv("PHONE_NUMBER_ID", "").strip()
    env_token = os.getenv("ACCESS_TOKEN", "").strip()
    env_configured = bool(env_waba and env_phone and env_token)

    if not account:
        return {
            "connected": False,
            "onboarding_status": None,
            "credential_source": "environment" if env_configured else None,
            "env_credentials_configured": env_configured,
            "env_waba_id": env_waba or None,
            "env_phone_number_id": env_phone or None,
            "latest_session": _session_to_dict(latest_session) if latest_session else None,
        }

    return {
        "connected": account.onboarding_status == "active",
        "onboarding_status": account.onboarding_status,
        "sync_status": account.sync_status,
        "credential_source": "database",
        "env_credentials_configured": env_configured,
        "waba_id": account.waba_id,
        "phone_number_id": account.phone_number_id,
        "business_id": account.business_id,
        "display_phone_number": account.display_phone_number,
        "verified_name": account.verified_name,
        "platform_type": account.platform_type,
        "webhook_subscribed": account.webhook_subscribed,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
        "latest_session": _session_to_dict(latest_session) if latest_session else None,
    }


def _session_to_dict(session: WhatsAppOnboardingSession) -> dict[str, Any]:
    return {
        "id": session.id,
        "status": session.status,
        "event_type": session.event_type,
        "current_step": session.current_step,
        "error_code": session.error_code,
        "error_message": session.error_message,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "step_logs": json.loads(session.step_logs or "[]"),
    }

"""WhatsApp Business App coexistence onboarding service.

Handles the server-side Embedded Signup pipeline:
  1. Validate session event (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING)
  2. Exchange authorization code for business token
  3. Subscribe app to customer WABA webhooks
  4. Skip phone registration (number already on Business App)
  5. Verify coexistence status (is_on_biz_app + CLOUD_API)
  6. Activate account (DB becomes primary credential source)

Historical message import is intentionally skipped — only future messages
are ingested via the standard messages and smb_message_echoes webhooks.
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
META_APP_ID = os.getenv("META_APP_ID", "").strip()
META_APP_SECRET = os.getenv("META_APP_SECRET", "").strip()
META_CONFIG_ID = os.getenv("META_CONFIG_ID", "2349378865592558").strip()

FINISH_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"

# Meta may emit these on successful Embedded Signup depending on flow version.
_ACCEPTED_FINISH_EVENTS = {
    FINISH_EVENT,
    "FINISH",
    "FINISH_ONLY_WABA",
}

# OAuth succeeded but Embedded Signup never emitted WA_EMBEDDED_SIGNUP JSON.
OAUTH_REDIRECT_EVENT = "OAUTH_REDIRECT"

_WHATSAPP_SCOPES = {
    "whatsapp_business_management",
    "whatsapp_business_messaging",
}


def _is_valid_finish_event(event: str) -> bool:
    return event in _ACCEPTED_FINISH_EVENTS


class OnboardingError(Exception):
    """Raised when onboarding cannot proceed; carries an HTTP-friendly code."""

    def __init__(self, message: str, code: str = "onboarding_failed", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def _append_step(session: WhatsAppOnboardingSession, step: str, detail: str = "", level: str = "info") -> None:
    logs: list[dict[str, Any]] = json.loads(session.step_logs or "[]")
    entry = {
        "step": step,
        "detail": detail,
        "level": level,
        "timestamp": datetime.utcnow().isoformat(),
    }
    logs.append(entry)
    session.step_logs = json.dumps(logs)
    log_fn = logger.warning if level == "warning" else logger.error if level == "error" else logger.info
    log_fn("onboarding[%s] %s: %s", session.id, step, detail or "(ok)")


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


async def exchange_code_for_token(code: str) -> tuple[str, dict[str, Any]]:
    """Exchange the Embedded Signup code for a business-scoped access token."""
    if not META_APP_ID or not META_APP_SECRET:
        raise OnboardingError(
            "META_APP_ID and META_APP_SECRET must be configured.",
            code="missing_app_credentials",
            status_code=500,
        )

    params = {
        "client_id": META_APP_ID,
        "client_secret": META_APP_SECRET,
        "code": code,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(_graph_url("oauth/access_token"), params=params)

    if response.status_code >= 400:
        logger.error(
            "Token exchange failed: status=%s body=%s",
            response.status_code,
            response.text[:1000],
        )
        raise OnboardingError(
            "Authorization code is invalid or expired. Please try connecting again.",
            code="invalid_code",
            status_code=409,
        )

    try:
        data = response.json()
        token = data.get("access_token", "")
        meta = data
    except ValueError:
        token = response.text.strip()
        meta = {"raw": token}

    if not token:
        raise OnboardingError(
            "Token exchange succeeded but no access token was returned.",
            code="invalid_code",
            status_code=502,
        )
    return token, meta


async def subscribe_waba(waba_id: str, token: str) -> None:
    result = await _graph_post(f"{waba_id}/subscribed_apps", token)
    if not result.get("success"):
        raise OnboardingError(
            "Failed to subscribe to WABA webhooks. Check app permissions.",
            code="missing_permissions",
            status_code=403,
        )


async def fetch_phone_number_id(waba_id: str, token: str) -> str:
    """Fallback when Embedded Signup session omits phone_number_id."""
    data = await _graph_get(f"{waba_id}/phone_numbers", token)
    numbers = data.get("data") or []
    if not numbers:
        raise OnboardingError(
            "No phone numbers found on the WhatsApp Business Account.",
            code="missing_phone_number",
            status_code=400,
        )
    return str(numbers[0]["id"])


async def verify_coexistence_status(phone_number_id: str, token: str) -> dict[str, Any]:
    return await _graph_get(
        phone_number_id,
        token,
        params={"fields": "is_on_biz_app,platform_type,display_phone_number,verified_name"},
    )


async def discover_assets_from_token(access_token: str) -> dict[str, Any]:
    """Discover shared WABA + coexistence phone from token debug granular scopes.

    Used when Facebook Login returns an OAuth code but Embedded Signup never
    emits a WA_EMBEDDED_SIGNUP FINISH event (misconfigured Login for Business
    configuration or OAuth-only reconnect flow).
    """
    if not META_APP_ID or not META_APP_SECRET:
        raise OnboardingError(
            "META_APP_ID and META_APP_SECRET must be configured.",
            code="missing_app_credentials",
            status_code=500,
        )

    app_access_token = f"{META_APP_ID}|{META_APP_SECRET}"
    debug = await _graph_get(
        "debug_token",
        app_access_token,
        params={"input_token": access_token},
    )
    token_data = debug.get("data") or {}
    logger.info(
        "debug_token: is_valid=%s scopes=%s",
        token_data.get("is_valid"),
        [s.get("scope") for s in token_data.get("granular_scopes") or []],
    )

    waba_ids: list[str] = []
    for scope_entry in token_data.get("granular_scopes") or []:
        scope_name = scope_entry.get("scope", "")
        if scope_name in _WHATSAPP_SCOPES:
            for target_id in scope_entry.get("target_ids") or []:
                if target_id and str(target_id) not in waba_ids:
                    waba_ids.append(str(target_id))

    if not waba_ids:
        raise OnboardingError(
            "OAuth succeeded but no WhatsApp Business Account was shared. "
            "Your Facebook Login for Business configuration (ID "
            f"{META_CONFIG_ID}) likely does not include WhatsApp Business App "
            "coexistence onboarding. In Meta App Dashboard → Facebook Login for "
            "Business → Configurations, ensure the config uses WhatsApp Embedded "
            "Signup with Business App coexistence enabled — not OAuth reconnect only.",
            code="no_waba_in_token",
            status_code=400,
        )

    for waba_id in waba_ids:
        numbers = await _graph_get(f"{waba_id}/phone_numbers", access_token)
        for entry in numbers.get("data") or []:
            phone_number_id = str(entry.get("id") or "")
            if not phone_number_id:
                continue
            phone_info = await verify_coexistence_status(phone_number_id, access_token)
            if phone_info.get("is_on_biz_app") and phone_info.get("platform_type") == "CLOUD_API":
                logger.info(
                    "discovered coexistence phone: waba_id=%s phone_number_id=%s",
                    waba_id,
                    phone_number_id,
                )
                return {
                    "waba_id": waba_id,
                    "phone_number_id": phone_number_id,
                    "business_id": None,
                    "phone_info": phone_info,
                    "debug_token": token_data,
                }

    raise OnboardingError(
        "WhatsApp accounts were shared but none are in Business App coexistence mode "
        "(is_on_biz_app=true, platform_type=CLOUD_API). Complete the WhatsApp Business "
        "App onboarding screens in Embedded Signup, not just the OAuth reconnect step.",
        code="no_coexistence_phone",
        status_code=400,
    )


def check_onboarding_conflict(db: Session, waba_id: str) -> WhatsAppAccount | None:
    """Return the active account if it conflicts with a new WABA."""
    active = (
        db.query(WhatsAppAccount)
        .filter(WhatsAppAccount.is_active.is_(True))
        .order_by(WhatsAppAccount.updated_at.desc())
        .first()
    )
    if active and active.waba_id != waba_id:
        raise OnboardingError(
            "Another WhatsApp account is already connected. Disconnect it in the "
            "WhatsApp Business App (Settings → Account → Business Platform) before "
            "connecting a new number.",
            code="existing_onboarding_conflict",
            status_code=409,
        )
    return active


def create_session(
    db: Session,
    *,
    event_type: str | None = None,
    waba_id: str | None = None,
    phone_number_id: str | None = None,
    business_id: str | None = None,
    meta_session_id: str | None = None,
) -> WhatsAppOnboardingSession:
    session = WhatsAppOnboardingSession(
        event_type=event_type,
        waba_id=waba_id,
        phone_number_id=phone_number_id,
        business_id=business_id,
        meta_session_id=meta_session_id,
        status="started",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    _append_step(session, "session_created")
    db.commit()
    return session


async def stage_code_exchange(db: Session, code: str) -> WhatsAppOnboardingSession:
    """Exchange OAuth code immediately and stage the token for later completion."""
    session = create_session(db, event_type="code_staged")
    _append_step(session, "exchanging_token_immediately")
    db.commit()
    try:
        access_token, token_meta = await exchange_code_for_token(code)
    except OnboardingError:
        session.status = "failed"
        _append_step(session, "token_exchange_failed", level="error")
        db.commit()
        raise

    session.pending_access_token = access_token
    session.pending_token_meta = json.dumps(token_meta)
    session.token_exchanged_at = datetime.utcnow()
    session.status = "token_staged"
    _append_step(session, "token_staged")
    db.commit()
    db.refresh(session)
    logger.info("OAuth code staged: session_id=%s", session.id)
    return session


async def _resolve_access_token(
    db: Session,
    *,
    code: str | None,
    staging_session_id: int | None,
    ob_session: WhatsAppOnboardingSession,
) -> tuple[str, dict[str, Any]]:
    if staging_session_id:
        staged = db.get(WhatsAppOnboardingSession, staging_session_id)
        if not staged or not staged.pending_access_token:
            raise OnboardingError(
                "Staged access token is missing. Try connecting again.",
                code="invalid_staging",
                status_code=400,
            )
        token_meta = json.loads(staged.pending_token_meta or "{}")
        _append_step(
            ob_session,
            "using_staged_token",
            detail=f"staged_at={staged.token_exchanged_at.isoformat() if staged.token_exchanged_at else 'unknown'}",
        )
        return staged.pending_access_token, token_meta

    if not code:
        raise OnboardingError(
            "No authorization code or staged token provided.",
            code="missing_code",
            status_code=400,
        )

    return await exchange_code_for_token(code)


def record_cancellation(
    db: Session,
    *,
    current_step: str | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    meta_session_id: str | None = None,
    session_data: dict | None = None,
) -> WhatsAppOnboardingSession:
    data = session_data or {}
    inner = data.get("data") or data
    session = WhatsAppOnboardingSession(
        event_type=data.get("event") or "CANCEL",
        current_step=current_step or inner.get("current_step"),
        error_code=error_code or inner.get("error_code"),
        error_message=error_message or inner.get("error_message"),
        meta_session_id=meta_session_id or inner.get("session_id"),
        waba_id=inner.get("waba_id"),
        phone_number_id=inner.get("phone_number_id"),
        business_id=inner.get("business_id"),
        status="cancelled",
        completed_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    _append_step(
        session,
        "user_cancelled",
        detail=current_step or error_message or "User closed Embedded Signup",
        level="warning",
    )
    db.commit()
    logger.info(
        "Onboarding cancelled: step=%s error=%s",
        session.current_step,
        session.error_message,
    )
    return session


async def complete_onboarding(
    db: Session,
    *,
    code: str | None = None,
    session_data: dict[str, Any],
    existing_session_id: int | None = None,
    staging_session_id: int | None = None,
    discover_assets: bool = False,
) -> WhatsAppAccount:
    """Run the full coexistence onboarding pipeline."""
    if not code and not staging_session_id:
        raise OnboardingError(
            "Authorization code or staged token is required.",
            code="missing_code",
            status_code=400,
        )

    event = session_data.get("event", "")
    inner = session_data.get("data") or session_data
    oauth_only = event == OAUTH_REDIRECT_EVENT or discover_assets

    if oauth_only:
        ob_session = None
        if staging_session_id:
            ob_session = db.get(WhatsAppOnboardingSession, staging_session_id)
        elif existing_session_id:
            ob_session = db.get(WhatsAppOnboardingSession, existing_session_id)
        if not ob_session:
            ob_session = create_session(db, event_type=OAUTH_REDIRECT_EVENT)
        _append_step(
            ob_session,
            "oauth_redirect_path",
            detail="No WA_EMBEDDED_SIGNUP FINISH — discovering assets from token",
            level="warning",
        )
        db.commit()

        _append_step(ob_session, "resolving_access_token")
        db.commit()
        try:
            access_token, token_meta = await _resolve_access_token(
                db,
                code=code,
                staging_session_id=staging_session_id,
                ob_session=ob_session,
            )
        except OnboardingError:
            ob_session.status = "failed"
            _append_step(ob_session, "token_exchange_failed", level="error")
            db.commit()
            raise

        _append_step(ob_session, "discovering_assets_from_token")
        db.commit()
        try:
            discovered = await discover_assets_from_token(access_token)
        except OnboardingError:
            ob_session.status = "failed"
            _append_step(ob_session, "asset_discovery_failed", level="error")
            db.commit()
            raise

        waba_id = discovered["waba_id"]
        phone_number_id = discovered["phone_number_id"]
        business_id = discovered.get("business_id")
        phone_info = discovered.get("phone_info") or {}

        check_onboarding_conflict(db, waba_id)
        existing = (
            db.query(WhatsAppAccount)
            .filter(WhatsAppAccount.waba_id == waba_id)
            .first()
        )
        if existing:
            account = existing
            account.access_token = access_token
            account.phone_number_id = phone_number_id
            account.business_id = business_id
            account.onboarding_status = "token_exchanged"
            account.sync_status = "skipped"
            account.updated_at = datetime.utcnow()
        else:
            account = WhatsAppAccount(
                waba_id=waba_id,
                phone_number_id=phone_number_id,
                business_id=business_id,
                access_token=access_token,
                coexistence_enabled=True,
                onboarding_status="token_exchanged",
                sync_status="skipped",
                raw_business_info=json.dumps(
                    {"token_meta": token_meta, "discovered": discovered, "oauth_only": True}
                ),
            )
            db.add(account)

        db.commit()
        db.refresh(account)
        ob_session.whatsapp_account_id = account.id
        ob_session.waba_id = waba_id
        ob_session.phone_number_id = phone_number_id
        ob_session.business_id = business_id
        ob_session.status = "code_received"
        _append_step(ob_session, "token_exchanged")
        _append_step(ob_session, "assets_discovered", detail=json.dumps(discovered)[:500])
        db.commit()

        _append_step(ob_session, "subscribing_webhooks")
        db.commit()
        try:
            await subscribe_waba(waba_id, access_token)
        except OnboardingError:
            account.onboarding_status = "failed"
            ob_session.status = "failed"
            _append_step(ob_session, "webhook_subscribe_failed", level="error")
            db.commit()
            raise

        account.webhook_subscribed = True
        account.onboarding_status = "subscribed"
        account.is_on_biz_app = bool(phone_info.get("is_on_biz_app"))
        account.platform_type = phone_info.get("platform_type")
        account.display_phone_number = phone_info.get("display_phone_number")
        account.verified_name = phone_info.get("verified_name")
        _append_step(ob_session, "webhooks_subscribed")
        _append_step(ob_session, "skipped_phone_registration", detail="coexistence")
        _append_step(ob_session, "coexistence_verified", detail=json.dumps(phone_info)[:300])
        db.commit()

        db.query(WhatsAppAccount).filter(
            WhatsAppAccount.id != account.id,
            WhatsAppAccount.is_active.is_(True),
        ).update({"is_active": False, "updated_at": datetime.utcnow()})

        account.is_active = True
        account.onboarding_status = "active"
        account.updated_at = datetime.utcnow()
        ob_session.status = "completed"
        ob_session.completed_at = datetime.utcnow()
        _append_step(ob_session, "onboarding_complete")
        db.commit()
        db.refresh(account)
        logger.info(
            "OAuth-only coexistence onboarding complete: waba_id=%s phone_number_id=%s",
            account.waba_id,
            account.phone_number_id,
        )
        return account

    if not _is_valid_finish_event(event):
        raise OnboardingError(
            f"Expected a FINISH coexistence event, got {event or 'unknown'}.",
            code="invalid_session_event",
            status_code=400,
        )

    waba_id = str(inner.get("waba_id") or "").strip()
    phone_number_id = str(inner.get("phone_number_id") or "").strip()
    business_id = str(inner.get("business_id") or "").strip() or None

    if not waba_id:
        raise OnboardingError(
            "WABA ID missing from Embedded Signup session.",
            code="missing_waba_id",
            status_code=400,
        )

    ob_session = None
    if staging_session_id:
        ob_session = db.get(WhatsAppOnboardingSession, staging_session_id)
        if ob_session:
            ob_session.event_type = event
            ob_session.waba_id = waba_id
            ob_session.phone_number_id = phone_number_id or None
            ob_session.business_id = business_id
            db.commit()
    if not ob_session and existing_session_id:
        ob_session = db.get(WhatsAppOnboardingSession, existing_session_id)
    if not ob_session:
        ob_session = create_session(
            db,
            event_type=event,
            waba_id=waba_id,
            phone_number_id=phone_number_id or None,
            business_id=business_id,
        )

    _append_step(ob_session, "session_received", detail=json.dumps(inner)[:500])
    db.commit()

    check_onboarding_conflict(db, waba_id)
    _append_step(ob_session, "conflict_check_passed")
    db.commit()

    _append_step(ob_session, "resolving_access_token")
    db.commit()
    try:
        access_token, token_meta = await _resolve_access_token(
            db,
            code=code,
            staging_session_id=staging_session_id,
            ob_session=ob_session,
        )
    except OnboardingError:
        ob_session.status = "failed"
        _append_step(ob_session, "token_exchange_failed", level="error")
        db.commit()
        raise

    _append_step(ob_session, "token_exchanged")
    ob_session.status = "code_received"
    db.commit()

    if not phone_number_id:
        _append_step(ob_session, "fetching_phone_number_id")
        db.commit()
        phone_number_id = await fetch_phone_number_id(waba_id, access_token)
        _append_step(ob_session, "phone_number_id_resolved", detail=phone_number_id)
        db.commit()

    existing = (
        db.query(WhatsAppAccount)
        .filter(WhatsAppAccount.waba_id == waba_id)
        .first()
    )
    if existing:
        account = existing
        account.access_token = access_token
        account.phone_number_id = phone_number_id
        account.business_id = business_id
        account.onboarding_status = "token_exchanged"
        account.sync_status = "skipped"
        account.updated_at = datetime.utcnow()
    else:
        account = WhatsAppAccount(
            waba_id=waba_id,
            phone_number_id=phone_number_id,
            business_id=business_id,
            access_token=access_token,
            coexistence_enabled=True,
            onboarding_status="token_exchanged",
            sync_status="skipped",
            raw_business_info=json.dumps({"token_meta": token_meta, "session": inner}),
        )
        db.add(account)

    db.commit()
    db.refresh(account)
    ob_session.whatsapp_account_id = account.id
    ob_session.waba_id = waba_id
    ob_session.phone_number_id = phone_number_id
    ob_session.business_id = business_id
    db.commit()

    _append_step(ob_session, "subscribing_webhooks")
    db.commit()
    try:
        await subscribe_waba(waba_id, access_token)
    except OnboardingError:
        account.onboarding_status = "failed"
        ob_session.status = "failed"
        _append_step(ob_session, "webhook_subscribe_failed", level="error")
        db.commit()
        raise

    account.webhook_subscribed = True
    account.onboarding_status = "subscribed"
    _append_step(ob_session, "webhooks_subscribed")
    _append_step(ob_session, "skipped_phone_registration", detail="coexistence — number already registered on Business App")
    _append_step(ob_session, "skipped_history_sync", detail="future messages only")
    db.commit()

    _append_step(ob_session, "verifying_coexistence_status")
    db.commit()
    phone_info = await verify_coexistence_status(phone_number_id, access_token)
    is_on_biz_app = phone_info.get("is_on_biz_app")
    platform_type = phone_info.get("platform_type")

    account.is_on_biz_app = bool(is_on_biz_app)
    account.platform_type = platform_type
    account.display_phone_number = phone_info.get("display_phone_number")
    account.verified_name = phone_info.get("verified_name")
    account.raw_business_info = json.dumps(
        {"token_meta": token_meta, "session": inner, "phone_info": phone_info}
    )

    if not is_on_biz_app or platform_type != "CLOUD_API":
        account.onboarding_status = "failed"
        ob_session.status = "failed"
        _append_step(
            ob_session,
            "coexistence_verification_failed",
            detail=json.dumps(phone_info),
            level="error",
        )
        db.commit()
        raise OnboardingError(
            "Phone number is not in coexistence mode (is_on_biz_app=true, platform_type=CLOUD_API). "
            "Ensure you completed the WhatsApp Business App connection flow.",
            code="coexistence_not_verified",
            status_code=400,
        )

    _append_step(ob_session, "coexistence_verified", detail=json.dumps(phone_info)[:300])
    db.commit()

    db.query(WhatsAppAccount).filter(
        WhatsAppAccount.id != account.id,
        WhatsAppAccount.is_active.is_(True),
    ).update({"is_active": False, "updated_at": datetime.utcnow()})

    account.is_active = True
    account.onboarding_status = "active"
    account.updated_at = datetime.utcnow()
    ob_session.status = "completed"
    ob_session.completed_at = datetime.utcnow()
    _append_step(ob_session, "onboarding_complete")
    db.commit()
    db.refresh(account)

    logger.info(
        "Coexistence onboarding complete: waba_id=%s phone_number_id=%s display=%s",
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

    if not account:
        return {
            "connected": False,
            "onboarding_status": None,
            "latest_session": _session_to_dict(latest_session) if latest_session else None,
        }

    return {
        "connected": account.onboarding_status == "active",
        "onboarding_status": account.onboarding_status,
        "sync_status": account.sync_status,
        "waba_id": account.waba_id,
        "phone_number_id": account.phone_number_id,
        "business_id": account.business_id,
        "display_phone_number": account.display_phone_number,
        "verified_name": account.verified_name,
        "is_on_biz_app": account.is_on_biz_app,
        "platform_type": account.platform_type,
        "coexistence_enabled": account.coexistence_enabled,
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


def mark_account_disconnected(db: Session, waba_id: str | None = None) -> None:
    query = db.query(WhatsAppAccount).filter(WhatsAppAccount.is_active.is_(True))
    if waba_id:
        query = query.filter(WhatsAppAccount.waba_id == waba_id)
    accounts = query.all()
    for account in accounts:
        account.is_active = False
        account.onboarding_status = "disconnected"
        account.updated_at = datetime.utcnow()
        logger.warning("WhatsApp account disconnected: waba_id=%s", account.waba_id)
    db.commit()

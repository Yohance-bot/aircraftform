"""Resolve WhatsApp API credentials from the database or environment."""

from __future__ import annotations

import logging
import os

from database import SessionLocal
from onboarding_models import WhatsAppAccount

logger = logging.getLogger("amc.whatsapp.credentials")


def resolve_whatsapp_credentials() -> tuple[str | None, str | None]:
    """Return (phone_number_id, access_token) for the active Cloud API account.

    When an active onboarded account exists in the database, its credentials
    take priority over environment variables. Otherwise falls back to env vars
    (useful for the Meta test number during development).
    """
    db = SessionLocal()
    try:
        account = (
            db.query(WhatsAppAccount)
            .filter(
                WhatsAppAccount.is_active.is_(True),
                WhatsAppAccount.onboarding_status == "active",
            )
            .order_by(WhatsAppAccount.updated_at.desc())
            .first()
        )
        if account:
            logger.debug(
                "Using DB credentials for phone_number_id=%s waba_id=%s",
                account.phone_number_id,
                account.waba_id,
            )
            return account.phone_number_id, account.access_token
    except Exception as exc:
        logger.warning("Failed to load WhatsApp account from DB: %s", exc)
    finally:
        db.close()

    phone_number_id = os.getenv("PHONE_NUMBER_ID", "").strip() or None
    access_token = os.getenv("ACCESS_TOKEN", "").strip() or None
    return phone_number_id, access_token


def get_active_display_phone_digits() -> str | None:
    """Return the active business display number as Meta-style digits only."""
    import re

    db = SessionLocal()
    try:
        account = (
            db.query(WhatsAppAccount)
            .filter(
                WhatsAppAccount.is_active.is_(True),
                WhatsAppAccount.onboarding_status == "active",
            )
            .order_by(WhatsAppAccount.updated_at.desc())
            .first()
        )
        if account and account.display_phone_number:
            digits = re.sub(r"\D", "", account.display_phone_number)
            return digits or None
    except Exception as exc:
        logger.warning("Failed to load business display phone: %s", exc)
    finally:
        db.close()
    return None

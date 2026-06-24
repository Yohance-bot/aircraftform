"""Shared CRM helpers: settings store, timeline logging, serialization.

Imported by the scoring engine, AI module, router and webhook hooks. Keeps
JSON (de)serialization and the editable-settings defaults in one place.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from conversation_models import Conversation
from crm_models import CrmSetting, TimelineEvent

logger = logging.getLogger("amc.crm")

HEAT_COLD = "cold"
HEAT_WARM = "warm"
HEAT_HOT = "hot"

# Editable defaults (Phase 18). Stored per-key in crm_settings as JSON.
DEFAULT_SETTINGS: dict[str, Any] = {
    "sources": [
        "instagram",
        "website",
        "referral",
        "walk_in",
        "facebook",
        "school_visit",
        "other",
    ],
    "lead_statuses": [
        "new",
        "engaged",
        "follow_up_needed",
        "converted",
        "dead",
    ],
    "lead_buckets": ["kits", "camps", "unclassified"],
    "intent_tags": [
        "Parent",
        "School Teacher",
        "Price Sensitive",
        "Repeat Customer",
        "Corporate Inquiry",
        "Bulk Purchase",
        "Workshop Lead",
        "Drone Kit Buyer",
    ],
    "scoring_rules": {
        "asked_price": 10,
        "asked_dates": 10,
        "deep_topic": 15,
        "form_filled": 30,
        "repeat_question": 20,
        "inactive_3d": -10,
    },
    "heat_thresholds": {"warm": 30, "hot": 60},
    "reminder_defaults": {"snooze_options_days": [1, 3, 7], "default_days": 1},
}


def json_loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return fallback


def json_dumps(value: Any) -> str:
    return json.dumps(value, default=str)


def get_setting(db: Session, key: str) -> Any:
    """Return a CRM setting value, falling back to the built-in default."""
    row = db.get(CrmSetting, key)
    if row is None:
        return DEFAULT_SETTINGS.get(key)
    return json_loads(row.value, DEFAULT_SETTINGS.get(key))


def set_setting(db: Session, key: str, value: Any) -> None:
    row = db.get(CrmSetting, key)
    if row is None:
        row = CrmSetting(key=key, value=json_dumps(value))
        db.add(row)
    else:
        row.value = json_dumps(value)
        row.updated_at = datetime.utcnow()
    db.commit()


def all_settings(db: Session) -> dict[str, Any]:
    """Return the full settings map, merging stored values over defaults."""
    merged = {k: v for k, v in DEFAULT_SETTINGS.items()}
    for row in db.query(CrmSetting).all():
        merged[row.key] = json_loads(row.value, merged.get(row.key))
    return merged


def heat_category(score: int, thresholds: dict | None = None) -> str:
    thresholds = thresholds or DEFAULT_SETTINGS["heat_thresholds"]
    if score >= thresholds.get("hot", 60):
        return HEAT_HOT
    if score >= thresholds.get("warm", 30):
        return HEAT_WARM
    return HEAT_COLD


def log_timeline(
    db: Session,
    phone: str,
    event_type: str,
    title: str,
    *,
    detail: str | None = None,
    actor: str | None = None,
    meta: dict | None = None,
    commit: bool = True,
) -> TimelineEvent:
    """Append an event to a contact's activity timeline (Phase 4)."""
    event = TimelineEvent(
        phone=phone,
        event_type=event_type,
        title=title,
        detail=detail,
        actor=actor,
        meta=json_dumps(meta) if meta else None,
    )
    db.add(event)
    if commit:
        try:
            db.commit()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to log timeline event for %s: %s", phone, exc)
            db.rollback()
    return event


def touch_activity(db: Session, conv: Conversation, commit: bool = False) -> None:
    """Mark the contact as active now and nudge status out of 'new'."""
    conv.last_activity_at = datetime.utcnow()
    if conv.lead_status == "new":
        conv.lead_status = "engaged"
    if commit:
        db.commit()


def serialize_contact(db: Session, conv: Conversation) -> dict[str, Any]:
    """Flatten a Conversation row into the CRM contact API shape."""
    thresholds = get_setting(db, "heat_thresholds")
    return {
        "phone": conv.phone,
        "parent_name": conv.parent_name,
        "child_name": conv.child_name,
        "bucket": conv.bucket,
        "lead_bucket": conv.lead_bucket,
        "bot_paused": conv.bot_paused,
        "heat_score": conv.heat_score,
        "heat_category": heat_category(conv.heat_score, thresholds),
        "score_reasons": json_loads(conv.score_reasons, []),
        "lead_status": conv.lead_status,
        "intent_tags": json_loads(conv.intent_tags, []),
        "ai_summary": conv.ai_summary,
        "ai_recommendation": conv.ai_recommendation,
        "sentiment": conv.sentiment,
        "ai_generated_at": conv.ai_generated_at,
        "source": conv.source,
        "assigned_to": conv.assigned_to,
        "last_activity_at": conv.last_activity_at,
        "last_seen": conv.last_seen,
        "reminder_at": conv.reminder_at,
        "reminder_note": conv.reminder_note,
        "reminder_completed": conv.reminder_completed,
        "custom_fields": json_loads(conv.custom_fields, {}),
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }

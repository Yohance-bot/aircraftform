"""CRM API router (Phases 4-18).

All endpoints require the X-Admin-Key header, matching the existing admin
API. Grouped under the /api/crm prefix. The contact record is the
Conversation row (keyed by phone); surrounding objects (timeline, notes,
templates, settings) live in crm_models.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from conversation_models import AdminUser, Conversation, Message
from crm_ai import find_inactive_contacts, generate_lead_intelligence
from crm_models import CrmSetting, LeadNote, MessageTemplate, TimelineEvent
from crm_scoring import compute_score, recompute_score
from crm_service import (
    all_settings,
    get_setting,
    heat_category,
    json_dumps,
    json_loads,
    log_timeline,
    serialize_contact,
    set_setting,
)
from database import get_db
from models import Registration

logger = logging.getLogger("amc.crm.router")

router = APIRouter(prefix="/api/crm", tags=["crm"])

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


def _get_conv_or_404(db: Session, phone: str) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.phone == phone).first()
    if conv is None:
        raise HTTPException(status_code=404, detail="Contact not found.")
    return conv


# ---------------------------------------------------------------------------
# Contacts (Phase 6 / 7)
# ---------------------------------------------------------------------------


class ContactUpdate(BaseModel):
    lead_status: str | None = None
    lead_bucket: str | None = None
    source: str | None = None
    assigned_to: str | None = None
    intent_tags: list[str] | None = None
    custom_fields: dict[str, Any] | None = None


class BulkAction(BaseModel):
    phones: list[str] = Field(..., min_items=1)
    action: str  # update_status | assign | add_tag | set_bucket
    value: str


@router.get("/contacts", dependencies=[Depends(require_admin)])
def list_contacts(
    db: Session = Depends(get_db),
    search: str | None = None,
    lead_bucket: str | None = None,
    lead_status: str | None = None,
    heat: str | None = None,
    source: str | None = None,
    assigned_to: str | None = None,
    last_active_days: int | None = None,
    tag: str | None = None,
) -> dict[str, Any]:
    """Return filtered contacts plus the last message snippet for each."""
    convs = db.query(Conversation).all()
    thresholds = get_setting(db, "heat_thresholds")

    items: list[dict[str, Any]] = []
    for conv in convs:
        if lead_bucket and conv.lead_bucket != lead_bucket:
            continue
        if lead_status and conv.lead_status != lead_status:
            continue
        if source and conv.source != source:
            continue
        if assigned_to:
            if assigned_to == "__unassigned__" and conv.assigned_to:
                continue
            if assigned_to != "__unassigned__" and conv.assigned_to != assigned_to:
                continue
        if heat and heat_category(conv.heat_score, thresholds) != heat:
            continue
        if last_active_days is not None:
            cutoff = datetime.utcnow() - timedelta(days=last_active_days)
            ref = conv.last_activity_at or conv.updated_at
            if not ref or ref < cutoff:
                continue
        tags = json_loads(conv.intent_tags, [])
        if tag and tag not in tags:
            continue
        if search:
            q = search.lower()
            hay = " ".join(
                [
                    conv.parent_name or "",
                    conv.child_name or "",
                    conv.phone or "",
                    conv.ai_summary or "",
                ]
            ).lower()
            if q not in hay:
                continue

        data = serialize_contact(db, conv)
        last_msg = (
            db.query(Message)
            .filter(Message.phone == conv.phone)
            .order_by(Message.timestamp.desc())
            .first()
        )
        data["last_message"] = last_msg.body if last_msg else None
        data["_sort"] = (conv.last_activity_at or conv.updated_at or conv.created_at)
        items.append(data)

    items.sort(key=lambda x: x["_sort"] or datetime.min, reverse=True)
    for it in items:
        it.pop("_sort", None)
    return {"contacts": items, "total": len(items)}


@router.get("/contacts/{phone}", dependencies=[Depends(require_admin)])
def get_contact(phone: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    conv = _get_conv_or_404(db, phone)
    contact = serialize_contact(db, conv)
    contact["score_detail"] = compute_score(db, phone)

    notes = (
        db.query(LeadNote)
        .filter(LeadNote.phone == phone)
        .order_by(LeadNote.created_at.desc())
        .all()
    )
    timeline = (
        db.query(TimelineEvent)
        .filter(TimelineEvent.phone == phone)
        .order_by(TimelineEvent.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "contact": contact,
        "notes": [_note_dict(n) for n in notes],
        "timeline": [_timeline_dict(t) for t in timeline],
    }


@router.patch("/contacts/{phone}", dependencies=[Depends(require_admin)])
def update_contact(
    phone: str,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    x_actor: str | None = Header(default=None),
) -> dict[str, Any]:
    conv = _get_conv_or_404(db, phone)
    actor = x_actor or "admin"

    if payload.lead_status is not None and payload.lead_status != conv.lead_status:
        prev = conv.lead_status
        conv.lead_status = payload.lead_status
        log_timeline(
            db, phone, "status_changed",
            f"Status {prev} → {payload.lead_status}", actor=actor, commit=False,
        )
        if payload.lead_status == "converted":
            log_timeline(db, phone, "converted", "Lead marked as converted",
                         actor=actor, commit=False)
            try:
                import marketing_service
                marketing_service.on_conversion(db, phone)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("on_conversion hook failed for %s: %s", phone, exc)
    if payload.lead_bucket is not None and payload.lead_bucket != conv.lead_bucket:
        prev = conv.lead_bucket
        conv.lead_bucket = payload.lead_bucket
        log_timeline(db, phone, "bucket_changed",
                     f"Bucket {prev} → {payload.lead_bucket}", actor=actor, commit=False)
    if payload.source is not None:
        conv.source = payload.source
    if payload.assigned_to is not None:
        conv.assigned_to = payload.assigned_to or None
        log_timeline(db, phone, "assigned",
                     f"Assigned to {payload.assigned_to or 'nobody'}",
                     actor=actor, commit=False)
    if payload.intent_tags is not None:
        conv.intent_tags = json_dumps(payload.intent_tags)
    if payload.custom_fields is not None:
        conv.custom_fields = json_dumps(payload.custom_fields)

    conv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(conv)
    return serialize_contact(db, conv)


@router.post("/contacts/bulk", dependencies=[Depends(require_admin)])
def bulk_action(
    payload: BulkAction,
    db: Session = Depends(get_db),
    x_actor: str | None = Header(default=None),
) -> dict[str, Any]:
    actor = x_actor or "admin"
    updated = 0
    for phone in payload.phones:
        conv = db.query(Conversation).filter(Conversation.phone == phone).first()
        if not conv:
            continue
        if payload.action == "update_status":
            conv.lead_status = payload.value
            log_timeline(db, phone, "status_changed",
                         f"Status → {payload.value}", actor=actor, commit=False)
            if payload.value == "converted":
                try:
                    import marketing_service
                    marketing_service.on_conversion(db, phone)
                except Exception:
                    pass
        elif payload.action == "assign":
            conv.assigned_to = payload.value or None
            log_timeline(db, phone, "assigned",
                         f"Assigned to {payload.value or 'nobody'}", actor=actor, commit=False)
        elif payload.action == "set_bucket":
            conv.lead_bucket = payload.value
            log_timeline(db, phone, "bucket_changed",
                         f"Bucket → {payload.value}", actor=actor, commit=False)
        elif payload.action == "add_tag":
            tags = json_loads(conv.intent_tags, [])
            if payload.value not in tags:
                tags.append(payload.value)
                conv.intent_tags = json_dumps(tags)
        else:
            raise HTTPException(status_code=400, detail="Unknown bulk action.")
        conv.updated_at = datetime.utcnow()
        updated += 1
    db.commit()
    return {"updated": updated}


# ---------------------------------------------------------------------------
# Heat score (Phase 2)
# ---------------------------------------------------------------------------


@router.get("/contacts/{phone}/score", dependencies=[Depends(require_admin)])
def get_score(phone: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _get_conv_or_404(db, phone)
    return compute_score(db, phone)


@router.post("/contacts/{phone}/recompute-score", dependencies=[Depends(require_admin)])
def post_recompute_score(phone: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _get_conv_or_404(db, phone)
    return recompute_score(db, phone, actor="admin")


# ---------------------------------------------------------------------------
# AI intelligence (Phase 3)
# ---------------------------------------------------------------------------


@router.post("/contacts/{phone}/ai-refresh", dependencies=[Depends(require_admin)])
async def post_ai_refresh(phone: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _get_conv_or_404(db, phone)
    return await generate_lead_intelligence(db, phone, actor="admin")


@router.post("/ai/batch", dependencies=[Depends(require_admin)])
async def post_ai_batch(
    db: Session = Depends(get_db), hours: int = 24, limit: int = 25
) -> dict[str, Any]:
    """Refresh AI intelligence for inactive contacts (nightly batch trigger)."""
    phones = find_inactive_contacts(db, hours=hours, limit=limit)
    for phone in phones:
        try:
            await generate_lead_intelligence(db, phone, actor="batch")
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Batch AI refresh failed for %s: %s", phone, exc)
    return {"refreshed": len(phones)}


# ---------------------------------------------------------------------------
# Timeline (Phase 4)
# ---------------------------------------------------------------------------


@router.get("/contacts/{phone}/timeline", dependencies=[Depends(require_admin)])
def get_timeline(phone: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    events = (
        db.query(TimelineEvent)
        .filter(TimelineEvent.phone == phone)
        .order_by(TimelineEvent.created_at.desc())
        .limit(200)
        .all()
    )
    return [_timeline_dict(e) for e in events]


def _timeline_dict(e: TimelineEvent) -> dict[str, Any]:
    return {
        "id": e.id,
        "event_type": e.event_type,
        "title": e.title,
        "detail": e.detail,
        "actor": e.actor,
        "meta": json_loads(e.meta, None),
        "created_at": e.created_at,
    }


# ---------------------------------------------------------------------------
# Reminders (Phase 13)
# ---------------------------------------------------------------------------


class ReminderIn(BaseModel):
    reminder_at: datetime
    reminder_note: str | None = None


@router.post("/contacts/{phone}/reminder", dependencies=[Depends(require_admin)])
def create_reminder(
    phone: str, payload: ReminderIn, db: Session = Depends(get_db)
) -> dict[str, Any]:
    conv = _get_conv_or_404(db, phone)
    conv.reminder_at = payload.reminder_at
    conv.reminder_note = payload.reminder_note
    conv.reminder_completed = False
    conv.updated_at = datetime.utcnow()
    log_timeline(db, phone, "reminder_created",
                 f"Reminder set for {payload.reminder_at:%d %b %H:%M}",
                 detail=payload.reminder_note, actor="admin", commit=False)
    db.commit()
    return serialize_contact(db, conv)


@router.post("/contacts/{phone}/reminder/complete", dependencies=[Depends(require_admin)])
def complete_reminder(phone: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    conv = _get_conv_or_404(db, phone)
    conv.reminder_completed = True
    conv.updated_at = datetime.utcnow()
    log_timeline(db, phone, "reminder_completed", "Reminder completed",
                 actor="admin", commit=False)
    db.commit()
    return serialize_contact(db, conv)


class SnoozeIn(BaseModel):
    days: int = 1


@router.post("/contacts/{phone}/reminder/snooze", dependencies=[Depends(require_admin)])
def snooze_reminder(
    phone: str, payload: SnoozeIn, db: Session = Depends(get_db)
) -> dict[str, Any]:
    conv = _get_conv_or_404(db, phone)
    base = conv.reminder_at or datetime.utcnow()
    conv.reminder_at = max(base, datetime.utcnow()) + timedelta(days=payload.days)
    conv.reminder_completed = False
    conv.updated_at = datetime.utcnow()
    db.commit()
    return serialize_contact(db, conv)


# ---------------------------------------------------------------------------
# Follow-up queue (Phase 8)
# ---------------------------------------------------------------------------


@router.get("/followups", dependencies=[Depends(require_admin)])
def followups(db: Session = Depends(get_db)) -> dict[str, Any]:
    thresholds = get_setting(db, "heat_thresholds")
    now = datetime.utcnow()
    convs = db.query(Conversation).all()

    queue: list[dict[str, Any]] = []
    for conv in convs:
        cat = heat_category(conv.heat_score, thresholds)
        reasons: list[str] = []
        if conv.lead_status == "follow_up_needed":
            reasons.append("Marked follow-up")
        if conv.reminder_at and not conv.reminder_completed and conv.reminder_at <= now:
            reasons.append("Reminder due")
        inactive = (
            conv.last_activity_at and (now - conv.last_activity_at) > timedelta(days=2)
        )
        if cat == "hot" and inactive and conv.lead_status not in ("converted", "dead"):
            reasons.append("Hot lead gone quiet")
        if not reasons:
            continue
        data = serialize_contact(db, conv)
        data["followup_reasons"] = reasons
        queue.append(data)

    order = {"hot": 0, "warm": 1, "cold": 2}
    queue.sort(key=lambda x: (order.get(x["heat_category"], 3), -(x["heat_score"] or 0)))

    counts = {
        "hot": sum(1 for q in queue if q["heat_category"] == "hot"),
        "warm": sum(1 for q in queue if q["heat_category"] == "warm"),
        "cold": sum(1 for q in queue if q["heat_category"] == "cold"),
        "total": len(queue),
    }
    return {"queue": queue, "counts": counts}


# ---------------------------------------------------------------------------
# Notes (Phase 14)
# ---------------------------------------------------------------------------


class NoteIn(BaseModel):
    body: str = Field(..., min_length=1)
    author: str | None = None


def _note_dict(n: LeadNote) -> dict[str, Any]:
    return {
        "id": n.id,
        "body": n.body,
        "author": n.author,
        "created_at": n.created_at,
        "updated_at": n.updated_at,
    }


@router.get("/contacts/{phone}/notes", dependencies=[Depends(require_admin)])
def list_notes(phone: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    notes = (
        db.query(LeadNote)
        .filter(LeadNote.phone == phone)
        .order_by(LeadNote.created_at.desc())
        .all()
    )
    return [_note_dict(n) for n in notes]


@router.post("/contacts/{phone}/notes", dependencies=[Depends(require_admin)])
def add_note(
    phone: str, payload: NoteIn, db: Session = Depends(get_db)
) -> dict[str, Any]:
    _get_conv_or_404(db, phone)
    note = LeadNote(phone=phone, body=payload.body.strip(), author=payload.author or "admin")
    db.add(note)
    log_timeline(db, phone, "note_added", "Internal note added",
                 actor=payload.author or "admin", commit=False)
    db.commit()
    db.refresh(note)
    return _note_dict(note)


@router.delete("/notes/{note_id}", dependencies=[Depends(require_admin)])
def delete_note(note_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    note = db.get(LeadNote, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    db.delete(note)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Templates (Phase 9)
# ---------------------------------------------------------------------------


class TemplateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: str = "follow_up"
    body: str = Field(..., min_length=1)
    shortcut: str | None = None


def _template_dict(t: MessageTemplate) -> dict[str, Any]:
    return {
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "body": t.body,
        "shortcut": t.shortcut,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


@router.get("/templates", dependencies=[Depends(require_admin)])
def list_templates(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(MessageTemplate).order_by(MessageTemplate.updated_at.desc()).all()
    return [_template_dict(t) for t in rows]


@router.post("/templates", dependencies=[Depends(require_admin)])
def create_template(payload: TemplateIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    t = MessageTemplate(
        name=payload.name.strip(),
        category=payload.category,
        body=payload.body,
        shortcut=(payload.shortcut or "").strip() or None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_dict(t)


@router.patch("/templates/{template_id}", dependencies=[Depends(require_admin)])
def update_template(
    template_id: int, payload: TemplateIn, db: Session = Depends(get_db)
) -> dict[str, Any]:
    t = db.get(MessageTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found.")
    t.name = payload.name.strip()
    t.category = payload.category
    t.body = payload.body
    t.shortcut = (payload.shortcut or "").strip() or None
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return _template_dict(t)


@router.post("/templates/{template_id}/duplicate", dependencies=[Depends(require_admin)])
def duplicate_template(template_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    t = db.get(MessageTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found.")
    copy = MessageTemplate(
        name=f"{t.name} (copy)", category=t.category, body=t.body,
        shortcut=None,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return _template_dict(copy)


@router.delete("/templates/{template_id}", dependencies=[Depends(require_admin)])
def delete_template(template_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    t = db.get(MessageTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found.")
    db.delete(t)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Agents / assignment (Phase 15)
# ---------------------------------------------------------------------------


@router.get("/agents", dependencies=[Depends(require_admin)])
def list_agents(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    agents = db.query(AdminUser).filter(AdminUser.is_active.is_(True)).all()
    result = [{"name": a.name, "phone": a.phone} for a in agents]
    # Per-agent lead counts for dashboard metrics.
    counts = dict(
        db.query(Conversation.assigned_to, func.count(Conversation.phone))
        .group_by(Conversation.assigned_to)
        .all()
    )
    for a in result:
        a["lead_count"] = counts.get(a["name"], 0)
    return result


# ---------------------------------------------------------------------------
# Dashboard (Phase 5)
# ---------------------------------------------------------------------------


@router.get("/dashboard", dependencies=[Depends(require_admin)])
def dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    thresholds = get_setting(db, "heat_thresholds")
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    convs = db.query(Conversation).all()

    def is_today(dt: datetime | None) -> bool:
        return bool(dt and dt >= today)

    new_leads_today = sum(1 for c in convs if is_today(c.created_at))
    hot_leads = sum(
        1 for c in convs if heat_category(c.heat_score, thresholds) == "hot"
    )
    followups_due = sum(
        1 for c in convs
        if (c.reminder_at and not c.reminder_completed and c.reminder_at <= now)
        or c.lead_status == "follow_up_needed"
    )
    registrations_today = (
        db.query(func.count(Registration.id))
        .filter(Registration.created_at >= today)
        .scalar() or 0
    )
    payments = sum(1 for c in convs if c.bucket == "payment_confirmed")
    converted = sum(1 for c in convs if c.lead_status == "converted")

    # Avg first response time (in→out) over the last week, in minutes.
    avg_response = _avg_response_minutes(db, week_ago)

    # This-week aggregates.
    week_msgs = (
        db.query(func.count(Message.id))
        .filter(Message.timestamp >= week_ago)
        .scalar() or 0
    )
    week_convs = sum(1 for c in convs if (c.last_activity_at or c.updated_at) and (c.last_activity_at or c.updated_at) >= week_ago)
    total_leads = len(convs) or 1
    conversion_rate = round(converted / total_leads * 100, 1)
    dropoff = sum(1 for c in convs if c.lead_status == "dead")
    dropoff_rate = round(dropoff / total_leads * 100, 1)

    # Leads by day (last 14 days).
    leads_by_day = _series_by_day(convs, "created_at", days=14)
    # Leads by source.
    by_source: dict[str, int] = {}
    for c in convs:
        by_source[c.source or "other"] = by_source.get(c.source or "other", 0) + 1
    # Bucket distribution.
    by_bucket: dict[str, int] = {}
    for c in convs:
        by_bucket[c.lead_bucket or "unclassified"] = by_bucket.get(c.lead_bucket or "unclassified", 0) + 1

    # Conversion funnel.
    messaged = len(convs)
    engaged = sum(1 for c in convs if c.lead_status in ("engaged", "follow_up_needed", "converted"))
    form_filled = sum(1 for c in convs if c.bucket in ("form_submitted", "payment_confirmed"))
    funnel = [
        {"stage": "Messaged", "count": messaged},
        {"stage": "Engaged", "count": engaged},
        {"stage": "Form Filled", "count": form_filled},
        {"stage": "Payment", "count": payments},
        {"stage": "Converted", "count": converted},
    ]

    return {
        "today": {
            "new_leads": new_leads_today,
            "hot_leads": hot_leads,
            "followups_due": followups_due,
            "registrations": registrations_today,
            "payments": payments,
            "avg_response_minutes": avg_response,
        },
        "week": {
            "conversations": week_convs,
            "message_volume": week_msgs,
            "conversion_rate": conversion_rate,
            "dropoff_rate": dropoff_rate,
        },
        "charts": {
            "leads_by_day": leads_by_day,
            "leads_by_source": [{"label": k, "value": v} for k, v in by_source.items()],
            "bucket_distribution": [{"label": k, "value": v} for k, v in by_bucket.items()],
            "funnel": funnel,
        },
    }


def _avg_response_minutes(db: Session, since: datetime) -> float | None:
    """Average minutes between an inbound message and the next outbound one."""
    msgs = (
        db.query(Message)
        .filter(Message.timestamp >= since)
        .order_by(Message.phone.asc(), Message.timestamp.asc())
        .all()
    )
    deltas: list[float] = []
    pending_in: dict[str, datetime] = {}
    for m in msgs:
        if m.direction == "in":
            pending_in.setdefault(m.phone, m.timestamp)
        elif m.direction == "out" and m.phone in pending_in:
            delta = (m.timestamp - pending_in.pop(m.phone)).total_seconds() / 60
            if 0 <= delta <= 60 * 24:
                deltas.append(delta)
    if not deltas:
        return None
    return round(sum(deltas) / len(deltas), 1)


def _series_by_day(rows: list, attr: str, days: int = 14) -> list[dict[str, Any]]:
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    buckets = {(today - timedelta(days=i)).date(): 0 for i in range(days)}
    for r in rows:
        dt = getattr(r, attr, None)
        if dt and dt.date() in buckets:
            buckets[dt.date()] += 1
    ordered = sorted(buckets.items())
    return [{"date": d.isoformat(), "value": v} for d, v in ordered]


# ---------------------------------------------------------------------------
# Insights (Phase 16)
# ---------------------------------------------------------------------------


@router.get("/insights", dependencies=[Depends(require_admin)])
def insights(db: Session = Depends(get_db)) -> dict[str, Any]:
    import re
    from collections import Counter

    convs = db.query(Conversation).all()
    thresholds = get_setting(db, "heat_thresholds")

    tag_counter: Counter[str] = Counter()
    for c in convs:
        for t in json_loads(c.intent_tags, []):
            tag_counter[t] += 1

    source_counter: Counter[str] = Counter(c.source or "other" for c in convs)

    # Top questions: most frequent inbound message texts (proxy for FAQ demand).
    inbound = db.query(Message).filter(Message.direction == "in").all()
    q_counter: Counter[str] = Counter()
    for m in inbound:
        norm = re.sub(r"[^a-z0-9 ]", "", (m.body or "").lower()).strip()
        if 8 <= len(norm) <= 120 and not norm.startswith("["):
            q_counter[norm] += 1
    top_questions = [{"question": q, "count": n} for q, n in q_counter.most_common(10)]
    # Knowledge gaps: repeated questions that escalated (bot couldn't answer).
    gaps = [{"question": q, "count": n} for q, n in q_counter.most_common(20) if n >= 2][:10]

    hot_trend = _series_by_day(
        [c for c in convs if heat_category(c.heat_score, thresholds) == "hot"],
        "updated_at", days=14,
    )

    inactive = [
        {"phone": c.phone, "parent_name": c.parent_name, "heat_score": c.heat_score,
         "last_activity_at": c.last_activity_at}
        for c in convs
        if c.last_activity_at and (datetime.utcnow() - c.last_activity_at) > timedelta(days=3)
        and c.lead_status not in ("converted", "dead")
    ]
    inactive.sort(key=lambda x: x["heat_score"] or 0, reverse=True)

    return {
        "top_questions": top_questions,
        "knowledge_gaps": gaps,
        "common_tags": [{"label": k, "value": v} for k, v in tag_counter.most_common(10)],
        "common_sources": [{"label": k, "value": v} for k, v in source_counter.most_common()],
        "hot_lead_trend": hot_trend,
        "avg_response_minutes": _avg_response_minutes(db, datetime.utcnow() - timedelta(days=14)),
        "inactive_leads": inactive[:25],
    }


# ---------------------------------------------------------------------------
# Broadcast audience targeting (Phase 17)
# ---------------------------------------------------------------------------


class AudienceFilter(BaseModel):
    lead_bucket: str | None = None
    heat: str | None = None
    lead_status: str | None = None
    source: str | None = None
    tag: str | None = None
    city: str | None = None
    last_active_days: int | None = None


@router.post("/audience", dependencies=[Depends(require_admin)])
def audience(payload: AudienceFilter, db: Session = Depends(get_db)) -> dict[str, Any]:
    thresholds = get_setting(db, "heat_thresholds")
    now = datetime.utcnow()
    convs = db.query(Conversation).all()
    matched: list[dict[str, Any]] = []
    for c in convs:
        if payload.lead_bucket and c.lead_bucket != payload.lead_bucket:
            continue
        if payload.lead_status and c.lead_status != payload.lead_status:
            continue
        if payload.source and c.source != payload.source:
            continue
        if payload.heat and heat_category(c.heat_score, thresholds) != payload.heat:
            continue
        if payload.tag and payload.tag not in json_loads(c.intent_tags, []):
            continue
        if payload.city:
            cf = json_loads(c.custom_fields, {})
            if (cf.get("city") or "").lower() != payload.city.lower():
                continue
        if payload.last_active_days is not None:
            ref = c.last_activity_at or c.updated_at
            if not ref or ref < now - timedelta(days=payload.last_active_days):
                continue
        matched.append({"phone": c.phone, "parent_name": c.parent_name})
    return {"count": len(matched), "recipients": matched}


# ---------------------------------------------------------------------------
# Settings (Phase 18)
# ---------------------------------------------------------------------------


@router.get("/settings", dependencies=[Depends(require_admin)])
def get_settings(db: Session = Depends(get_db)) -> dict[str, Any]:
    return all_settings(db)


class SettingIn(BaseModel):
    value: Any


@router.put("/settings/{key}", dependencies=[Depends(require_admin)])
def put_setting(key: str, payload: SettingIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    set_setting(db, key, payload.value)
    return {"key": key, "value": payload.value}

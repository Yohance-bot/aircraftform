"""Marketing automation service (Phases 10-12).

Pure logic shared by the marketing router, the background scheduler, the
broadcast endpoint and the webhook. Kept side-effect-safe: every WhatsApp
send goes through ``send_text_tracked`` and failures are recorded, never
raised, so a bad send can't break a webhook or an API call.
"""

from __future__ import annotations

import logging
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from conversation_models import Conversation
from crm_service import json_dumps, json_loads, log_timeline
from marketing_models import (
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
from models import Registration
from whatsapp_messages import send_text_tracked

logger = logging.getLogger("amc.marketing")

_URL_RE = re.compile(r"https?://[^\s]+")
_TEMPLATE_VAR_RE = re.compile(r"\{\{(\w+)\}\}")


def public_base_url() -> str | None:
    """Absolute base URL of this backend, used to build tracked links.

    Render injects ``RENDER_EXTERNAL_URL`` automatically; ``BACKEND_PUBLIC_URL``
    is an explicit override. Returns ``None`` when neither is set, in which
    case link tracking is gracefully skipped.
    """
    url = (os.getenv("BACKEND_PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").strip()
    return url.rstrip("/") or None


# ---------------------------------------------------------------------------
# Personalisation
# ---------------------------------------------------------------------------


def personalise(body: str, conv: Conversation | None) -> str:
    """Substitute {{variables}} with contact data; unknowns become friendly."""
    if not body:
        return body
    cf = json_loads(conv.custom_fields, {}) if conv else {}
    first = (conv.parent_name or "").split()[0] if conv and conv.parent_name else ""
    values = {
        "name": first or "there",
        "parent_name": (conv.parent_name if conv else None) or "there",
        "child_name": (conv.child_name if conv else None) or "your child",
        "camp_date": cf.get("camp_date", "soon"),
        "product_name": cf.get("product_name", "our kits"),
        "city": cf.get("city", "your city"),
        "score": str(conv.heat_score) if conv else "",
    }
    return _TEMPLATE_VAR_RE.sub(lambda m: str(values.get(m.group(1), "")), body)


# ---------------------------------------------------------------------------
# Click tracking (Phase 12)
# ---------------------------------------------------------------------------


def build_tracked_body(db: Session, body: str, campaign_id: int | None, phone: str | None) -> str:
    """Rewrite URLs in ``body`` to per-recipient tracked redirect links.

    Returns the body unchanged if no public base URL is configured or there
    are no URLs to track.
    """
    base = public_base_url()
    if not base or not body:
        return body

    def _replace(match: re.Match) -> str:
        target = match.group(0)
        token = secrets.token_urlsafe(8)[:16]
        db.add(TrackedLink(id=token, target_url=target, campaign_id=campaign_id, phone=phone))
        return f"{base}/track/{token}"

    return _URL_RE.sub(_replace, body)


def record_click(db: Session, link_id: str, user_agent: str | None) -> str | None:
    """Record a click and return the target URL (or None if the link is unknown)."""
    link = db.get(TrackedLink, link_id)
    if not link:
        return None
    link.click_count = (link.click_count or 0) + 1
    db.add(TrackedClick(
        link_id=link_id, campaign_id=link.campaign_id, phone=link.phone, user_agent=user_agent
    ))
    if link.campaign_id:
        db.add(CampaignEvent(campaign_id=link.campaign_id, phone=link.phone or "", event_type="clicked"))
    if link.phone:
        log_timeline(db, link.phone, "campaign_clicked", "Clicked a campaign link",
                     detail=link.target_url, actor="lead", commit=False)
    db.commit()
    return link.target_url


# ---------------------------------------------------------------------------
# Campaigns (Phase 11)
# ---------------------------------------------------------------------------


def create_campaign(
    db: Session,
    *,
    name: str,
    type: str = "broadcast",
    body: str | None = None,
    template_id: int | None = None,
    audience_filters: dict | None = None,
    sequence_id: int | None = None,
) -> Campaign:
    camp = Campaign(
        name=name,
        type=type,
        body=body,
        template_id=template_id,
        audience_filters=json_dumps(audience_filters) if audience_filters else None,
        sequence_id=sequence_id,
    )
    db.add(camp)
    db.commit()
    db.refresh(camp)
    return camp


def record_send(
    db: Session,
    campaign_id: int,
    phone: str,
    wamid: str | None,
    *,
    ok: bool,
    error: str | None = None,
    commit: bool = True,
) -> CampaignMessage:
    msg = CampaignMessage(
        campaign_id=campaign_id,
        phone=phone,
        wa_message_id=wamid,
        status="sent" if ok else "failed",
        error=error,
    )
    db.add(msg)
    db.flush()
    db.add(CampaignEvent(
        campaign_id=campaign_id, phone=phone, message_id=msg.id,
        event_type="sent" if ok else "failed",
    ))
    if commit:
        db.commit()
    return msg


def handle_statuses(db: Session, statuses: list[dict]) -> None:
    """Apply WhatsApp delivery-status updates to campaign messages.

    ``statuses`` is ``value["statuses"]`` from the webhook envelope. Matches on
    the wamid; updates the message + appends a campaign event. Safe to call for
    statuses that don't belong to a campaign (they're simply ignored).
    """
    now = datetime.utcnow()
    for st in statuses or []:
        wamid = st.get("id")
        status = (st.get("status") or "").lower()
        if not wamid or status not in {"delivered", "read", "failed", "sent"}:
            continue
        msg = (
            db.query(CampaignMessage)
            .filter(CampaignMessage.wa_message_id == wamid)
            .first()
        )
        if not msg:
            continue
        # Don't regress status (read > delivered > sent).
        rank = {"sent": 0, "delivered": 1, "read": 2, "failed": 3, "replied": 4}
        if status == "delivered" and not msg.delivered_at:
            msg.delivered_at = now
        if status == "read" and not msg.read_at:
            msg.read_at = now
            if not msg.delivered_at:
                msg.delivered_at = now
        if status == "failed":
            msg.error = json_dumps(st.get("errors")) if st.get("errors") else "failed"
        if rank.get(status, 0) >= rank.get(msg.status, 0) and msg.status != "replied":
            msg.status = status
        db.add(CampaignEvent(campaign_id=msg.campaign_id, phone=msg.phone, message_id=msg.id, event_type=status))
    try:
        db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("handle_statuses commit failed: %s", exc)
        db.rollback()


def handle_inbound_reply(db: Session, phone: str) -> None:
    """Mark a contact's recent campaign messages as replied (once per campaign)."""
    cutoff = datetime.utcnow() - timedelta(days=14)
    msgs = (
        db.query(CampaignMessage)
        .filter(
            CampaignMessage.phone == phone,
            CampaignMessage.sent_at >= cutoff,
            CampaignMessage.replied_at.is_(None),
        )
        .all()
    )
    seen_campaigns: set[int] = set()
    now = datetime.utcnow()
    for m in msgs:
        m.replied_at = now
        m.status = "replied"
        if m.campaign_id not in seen_campaigns:
            db.add(CampaignEvent(campaign_id=m.campaign_id, phone=phone, message_id=m.id, event_type="replied"))
            seen_campaigns.add(m.campaign_id)
    if msgs:
        try:
            db.commit()
        except Exception:
            db.rollback()


def _last10(phone: str | None) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits


def campaign_metrics(db: Session, campaign_id: int) -> dict[str, Any]:
    msgs = db.query(CampaignMessage).filter(CampaignMessage.campaign_id == campaign_id).all()
    phones = {m.phone for m in msgs}
    sent = len(msgs)
    delivered = sum(1 for m in msgs if m.delivered_at or m.status in ("delivered", "read", "replied"))
    read = sum(1 for m in msgs if m.read_at or m.status in ("read", "replied"))
    failed = sum(1 for m in msgs if m.status == "failed")
    replied = sum(1 for m in msgs if m.replied_at)

    clicks = db.query(TrackedClick).filter(TrackedClick.campaign_id == campaign_id).all()
    total_clicks = len(clicks)
    unique_clicks = len({c.phone for c in clicks if c.phone}) or len({c.link_id for c in clicks})

    # Forms filled: recipients who have a registration on file.
    forms = 0
    converted = 0
    if phones:
        tails = {_last10(p) for p in phones if _last10(p)}
        for conv in db.query(Conversation).filter(Conversation.phone.in_(phones)).all():
            if conv.lead_status == "converted":
                converted += 1
        for t in tails:
            if db.query(Registration).filter(Registration.phone.like(f"%{t}%")).first():
                forms += 1

    def rate(n: int, d: int) -> float:
        return round(n / d * 100, 1) if d else 0.0

    return {
        "sent": sent,
        "delivered": delivered,
        "read": read,
        "failed": failed,
        "replied": replied,
        "forms_filled": forms,
        "converted": converted,
        "total_clicks": total_clicks,
        "unique_clicks": unique_clicks,
        "delivery_rate": rate(delivered, sent),
        "read_rate": rate(read, delivered),
        "reply_rate": rate(replied, delivered),
        "conversion_rate": rate(converted, sent),
        "ctr": rate(unique_clicks, delivered),
    }


# ---------------------------------------------------------------------------
# Drip sequences (Phase 10)
# ---------------------------------------------------------------------------


def _drip_log(db: Session, sequence_id: int | None, enrollment_id: int | None,
              phone: str | None, event: str, commit: bool = True) -> None:
    db.add(DripLog(sequence_id=sequence_id, enrollment_id=enrollment_id, phone=phone, event=event))
    if commit:
        try:
            db.commit()
        except Exception:
            db.rollback()


def _steps(db: Session, sequence_id: int) -> list[DripStep]:
    return (
        db.query(DripStep)
        .filter(DripStep.sequence_id == sequence_id)
        .order_by(DripStep.step_order.asc())
        .all()
    )


def _campaign_for_sequence(db: Session, seq: DripSequence) -> Campaign:
    existing = db.query(Campaign).filter(Campaign.sequence_id == seq.id).first()
    if existing:
        return existing
    return create_campaign(db, name=f"Drip: {seq.name}", type="drip", sequence_id=seq.id)


def _resolve_body(db: Session, step: DripStep) -> str:
    if step.body_override:
        return step.body_override
    if step.template_id:
        from crm_models import MessageTemplate
        t = db.get(MessageTemplate, step.template_id)
        if t:
            return t.body
    return ""


def eligible(conv: Conversation, seq: DripSequence) -> bool:
    """Whether a contact matches a sequence's audience filters."""
    buckets = json_loads(seq.bucket_filters, []) or []
    statuses = json_loads(seq.status_filters, []) or []
    score = json_loads(seq.score_filters, {}) or {}
    if buckets and conv.lead_bucket not in buckets:
        return False
    if statuses and conv.lead_status not in statuses:
        return False
    if score:
        lo = score.get("min")
        hi = score.get("max")
        if lo is not None and (conv.heat_score or 0) < lo:
            return False
        if hi is not None and (conv.heat_score or 0) > hi:
            return False
    return True


def _schedule_step(db: Session, enrollment: DripEnrollment, step: DripStep, conv: Conversation | None) -> None:
    body = personalise(_resolve_body(db, step), conv)
    send_at = datetime.utcnow() + timedelta(days=max(0, step.delay_days or 0))
    db.add(ScheduledMessage(
        enrollment_id=enrollment.id, sequence_id=enrollment.sequence_id,
        step_id=step.id, phone=enrollment.phone, body=body, send_at=send_at, status="pending",
    ))


def enroll(db: Session, sequence_id: int, phone: str) -> DripEnrollment | None:
    """Enroll a contact into a sequence and schedule its first step."""
    seq = db.get(DripSequence, sequence_id)
    if not seq:
        return None
    steps = _steps(db, sequence_id)
    if not steps:
        return None
    # Avoid duplicate active enrollment.
    existing = (
        db.query(DripEnrollment)
        .filter(
            DripEnrollment.sequence_id == sequence_id,
            DripEnrollment.phone == phone,
            DripEnrollment.status.in_(["active", "paused"]),
        )
        .first()
    )
    if existing:
        return existing

    enrollment = DripEnrollment(sequence_id=sequence_id, phone=phone, status="active", current_step=0)
    db.add(enrollment)
    db.flush()
    conv = db.query(Conversation).filter(Conversation.phone == phone).first()
    _schedule_step(db, enrollment, steps[0], conv)
    _drip_log(db, sequence_id, enrollment.id, phone, "enrolled", commit=False)
    log_timeline(db, phone, "campaign_received", f"Enrolled in drip: {seq.name}", actor="system", commit=False)
    db.commit()
    return enrollment


def _stop_enrollments(db: Session, phone: str, *, on: str) -> int:
    """Stop active enrollments for a phone where the matching stop flag is set.

    ``on`` is 'reply' or 'conversion'. Cancels pending scheduled messages.
    """
    flag_attr = "stop_on_reply" if on == "reply" else "stop_on_conversion"
    new_status = "stopped_reply" if on == "reply" else "stopped_conversion"
    enrollments = (
        db.query(DripEnrollment)
        .filter(DripEnrollment.phone == phone, DripEnrollment.status == "active")
        .all()
    )
    stopped = 0
    for en in enrollments:
        steps = _steps(db, en.sequence_id)
        if not any(getattr(s, flag_attr) for s in steps):
            continue
        en.status = new_status
        db.query(ScheduledMessage).filter(
            ScheduledMessage.enrollment_id == en.id,
            ScheduledMessage.status == "pending",
        ).update({"status": "cancelled"})
        _drip_log(db, en.sequence_id, en.id, phone, f"stopped_on_{on}", commit=False)
        stopped += 1
    if stopped:
        try:
            db.commit()
        except Exception:
            db.rollback()
    return stopped


def on_reply(db: Session, phone: str) -> None:
    """Called from the webhook when a lead sends an inbound message."""
    handle_inbound_reply(db, phone)
    _stop_enrollments(db, phone, on="reply")


def on_conversion(db: Session, phone: str) -> None:
    """Called when a lead is marked converted."""
    _stop_enrollments(db, phone, on="conversion")


def set_sequence_state(db: Session, sequence_id: int, action: str) -> int:
    """pause | resume | cancel all enrollments of a sequence. Returns count."""
    status_map = {"pause": "paused", "resume": "active", "cancel": "cancelled"}
    if action not in status_map:
        return 0
    target = status_map[action]
    if action == "resume":
        q = db.query(DripEnrollment).filter(
            DripEnrollment.sequence_id == sequence_id, DripEnrollment.status == "paused"
        )
    elif action == "pause":
        q = db.query(DripEnrollment).filter(
            DripEnrollment.sequence_id == sequence_id, DripEnrollment.status == "active"
        )
    else:  # cancel
        q = db.query(DripEnrollment).filter(
            DripEnrollment.sequence_id == sequence_id,
            DripEnrollment.status.in_(["active", "paused"]),
        )
    count = 0
    for en in q.all():
        en.status = target
        if action == "cancel":
            db.query(ScheduledMessage).filter(
                ScheduledMessage.enrollment_id == en.id, ScheduledMessage.status == "pending"
            ).update({"status": "cancelled"})
        count += 1
    _drip_log(db, sequence_id, None, None, f"sequence_{action}", commit=False)
    db.commit()
    return count


async def process_due(db: Session, limit: int = 100) -> dict[str, int]:
    """Send all due scheduled messages and advance enrollments.

    Called by the background scheduler loop and the /run-due cron endpoint.
    Idempotent per message (status flips to sent/skipped/failed).
    """
    now = datetime.utcnow()
    due = (
        db.query(ScheduledMessage)
        .filter(ScheduledMessage.status == "pending", ScheduledMessage.send_at <= now)
        .order_by(ScheduledMessage.send_at.asc())
        .limit(limit)
        .all()
    )
    sent = skipped = failed = 0
    for sm in due:
        enrollment = db.get(DripEnrollment, sm.enrollment_id) if sm.enrollment_id else None
        seq = db.get(DripSequence, sm.sequence_id) if sm.sequence_id else None
        # Skip if the enrollment/sequence is no longer active.
        if (enrollment and enrollment.status != "active") or (seq and not seq.active):
            sm.status = "skipped"
            skipped += 1
            _drip_log(db, sm.sequence_id, sm.enrollment_id, sm.phone, "skipped (inactive)", commit=False)
            continue

        campaign = _campaign_for_sequence(db, seq) if seq else None
        body = sm.body
        if campaign:
            body = build_tracked_body(db, body, campaign.id, sm.phone)

        wamid = await send_text_tracked(sm.phone, body)
        ok = wamid is not None or public_base_url() is None  # in dry-run/no-creds, treat as soft-sent
        sm.status = "sent" if ok else "failed"
        sm.sent_at = now
        sm.wa_message_id = wamid
        if not ok:
            sm.error = "send failed"
            failed += 1
        else:
            sent += 1
        if campaign:
            record_send(db, campaign.id, sm.phone, wamid, ok=ok, commit=False)
        _drip_log(db, sm.sequence_id, sm.enrollment_id, sm.phone,
                  f"step sent (wamid={wamid})" if ok else "send failed", commit=False)

        # Advance the enrollment to the next step.
        if enrollment and ok:
            steps = _steps(db, enrollment.sequence_id)
            enrollment.current_step += 1
            if enrollment.current_step < len(steps):
                conv = db.query(Conversation).filter(Conversation.phone == sm.phone).first()
                _schedule_step(db, enrollment, steps[enrollment.current_step], conv)
            else:
                enrollment.status = "completed"
                _drip_log(db, enrollment.sequence_id, enrollment.id, sm.phone, "completed", commit=False)
        db.commit()

    return {"sent": sent, "skipped": skipped, "failed": failed, "processed": len(due)}

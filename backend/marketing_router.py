"""Marketing API router (Phases 10-12): drip sequences, campaign analytics,
click tracking analytics. Mounted under /api/crm, admin-key protected.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from conversation_models import Conversation
from crm_service import json_loads
from database import get_db
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
)
from marketing_service import (
    campaign_metrics,
    eligible,
    enroll,
    process_due,
    set_sequence_state,
)

logger = logging.getLogger("amc.marketing.router")

router = APIRouter(prefix="/api/crm", tags=["marketing"])

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing admin key.")


# ---------------------------------------------------------------------------
# Drip sequences (Phase 10)
# ---------------------------------------------------------------------------


class StepIn(BaseModel):
    delay_days: int = 0
    template_id: int | None = None
    body_override: str | None = None
    stop_on_reply: bool = True
    stop_on_conversion: bool = True


class SequenceIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    trigger_type: str = "manual"
    bucket_filters: list[str] | None = None
    score_filters: dict | None = None
    status_filters: list[str] | None = None
    steps: list[StepIn] | None = None


def _seq_dict(db: Session, seq: DripSequence, *, detail: bool = False) -> dict[str, Any]:
    steps = db.query(DripStep).filter(DripStep.sequence_id == seq.id).order_by(DripStep.step_order).all()
    enrollments = db.query(DripEnrollment).filter(DripEnrollment.sequence_id == seq.id).all()
    by_status: dict[str, int] = {}
    for e in enrollments:
        by_status[e.status] = by_status.get(e.status, 0) + 1
    data = {
        "id": seq.id,
        "name": seq.name,
        "description": seq.description,
        "active": seq.active,
        "trigger_type": seq.trigger_type,
        "bucket_filters": json_loads(seq.bucket_filters, []),
        "score_filters": json_loads(seq.score_filters, {}),
        "status_filters": json_loads(seq.status_filters, []),
        "step_count": len(steps),
        "enrollment_counts": by_status,
        "total_enrolled": len(enrollments),
        "created_at": seq.created_at,
        "updated_at": seq.updated_at,
    }
    if detail:
        data["steps"] = [
            {
                "id": s.id, "step_order": s.step_order, "delay_days": s.delay_days,
                "template_id": s.template_id, "body_override": s.body_override,
                "stop_on_reply": s.stop_on_reply, "stop_on_conversion": s.stop_on_conversion,
            }
            for s in steps
        ]
    return data


def _replace_steps(db: Session, sequence_id: int, steps: list[StepIn]) -> None:
    db.query(DripStep).filter(DripStep.sequence_id == sequence_id).delete()
    for i, s in enumerate(steps or []):
        db.add(DripStep(
            sequence_id=sequence_id, step_order=i, delay_days=s.delay_days,
            template_id=s.template_id, body_override=s.body_override,
            stop_on_reply=s.stop_on_reply, stop_on_conversion=s.stop_on_conversion,
        ))


@router.get("/drip/sequences", dependencies=[Depends(require_admin)])
def list_sequences(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    seqs = db.query(DripSequence).order_by(DripSequence.created_at.desc()).all()
    return [_seq_dict(db, s) for s in seqs]


@router.post("/drip/sequences", dependencies=[Depends(require_admin)])
def create_sequence(payload: SequenceIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    from crm_service import json_dumps
    seq = DripSequence(
        name=payload.name.strip(),
        description=payload.description,
        trigger_type=payload.trigger_type,
        bucket_filters=json_dumps(payload.bucket_filters) if payload.bucket_filters else None,
        score_filters=json_dumps(payload.score_filters) if payload.score_filters else None,
        status_filters=json_dumps(payload.status_filters) if payload.status_filters else None,
    )
    db.add(seq)
    db.commit()
    db.refresh(seq)
    if payload.steps:
        _replace_steps(db, seq.id, payload.steps)
        db.commit()
    return _seq_dict(db, seq, detail=True)


@router.get("/drip/sequences/{seq_id}", dependencies=[Depends(require_admin)])
def get_sequence(seq_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    seq = db.get(DripSequence, seq_id)
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found.")
    data = _seq_dict(db, seq, detail=True)
    logs = (
        db.query(DripLog).filter(DripLog.sequence_id == seq_id)
        .order_by(DripLog.created_at.desc()).limit(50).all()
    )
    data["logs"] = [{"event": l.event, "phone": l.phone, "created_at": l.created_at} for l in logs]
    upcoming = (
        db.query(ScheduledMessage)
        .filter(ScheduledMessage.sequence_id == seq_id, ScheduledMessage.status == "pending")
        .order_by(ScheduledMessage.send_at.asc()).limit(50).all()
    )
    data["upcoming"] = [
        {"phone": s.phone, "send_at": s.send_at, "body": s.body[:120]} for s in upcoming
    ]
    return data


@router.patch("/drip/sequences/{seq_id}", dependencies=[Depends(require_admin)])
def update_sequence(seq_id: int, payload: SequenceIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    from crm_service import json_dumps
    seq = db.get(DripSequence, seq_id)
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found.")
    seq.name = payload.name.strip()
    seq.description = payload.description
    seq.trigger_type = payload.trigger_type
    seq.bucket_filters = json_dumps(payload.bucket_filters) if payload.bucket_filters else None
    seq.score_filters = json_dumps(payload.score_filters) if payload.score_filters else None
    seq.status_filters = json_dumps(payload.status_filters) if payload.status_filters else None
    seq.updated_at = datetime.utcnow()
    if payload.steps is not None:
        _replace_steps(db, seq_id, payload.steps)
    db.commit()
    return _seq_dict(db, seq, detail=True)


@router.delete("/drip/sequences/{seq_id}", dependencies=[Depends(require_admin)])
def delete_sequence(seq_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    seq = db.get(DripSequence, seq_id)
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found.")
    db.query(DripStep).filter(DripStep.sequence_id == seq_id).delete()
    db.query(ScheduledMessage).filter(
        ScheduledMessage.sequence_id == seq_id, ScheduledMessage.status == "pending"
    ).update({"status": "cancelled"})
    db.delete(seq)
    db.commit()
    return {"success": True}


class ActivateIn(BaseModel):
    active: bool


@router.post("/drip/sequences/{seq_id}/activate", dependencies=[Depends(require_admin)])
def activate_sequence(seq_id: int, payload: ActivateIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    seq = db.get(DripSequence, seq_id)
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found.")
    if payload.active and db.query(DripStep).filter(DripStep.sequence_id == seq_id).count() == 0:
        raise HTTPException(status_code=400, detail="Add at least one step before activating.")
    seq.active = payload.active
    seq.updated_at = datetime.utcnow()
    db.commit()
    return _seq_dict(db, seq, detail=True)


class EnrollIn(BaseModel):
    phones: list[str] | None = None
    use_audience: bool = False


@router.post("/drip/sequences/{seq_id}/enroll", dependencies=[Depends(require_admin)])
def enroll_contacts(seq_id: int, payload: EnrollIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    seq = db.get(DripSequence, seq_id)
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found.")
    phones = list(payload.phones or [])
    if payload.use_audience:
        for conv in db.query(Conversation).all():
            if eligible(conv, seq):
                phones.append(conv.phone)
    enrolled = 0
    for phone in set(phones):
        if enroll(db, seq_id, phone):
            enrolled += 1
    return {"enrolled": enrolled}


class StateIn(BaseModel):
    action: str  # pause | resume | cancel


@router.post("/drip/sequences/{seq_id}/state", dependencies=[Depends(require_admin)])
def sequence_state(seq_id: int, payload: StateIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    if payload.action not in ("pause", "resume", "cancel"):
        raise HTTPException(status_code=400, detail="action must be pause|resume|cancel")
    count = set_sequence_state(db, seq_id, payload.action)
    return {"affected": count, "action": payload.action}


@router.post("/drip/run-due", dependencies=[Depends(require_admin)])
async def run_due(db: Session = Depends(get_db)) -> dict[str, int]:
    """Cron-compatible trigger to process due scheduled messages on demand."""
    return await process_due(db)


# ---------------------------------------------------------------------------
# Campaign analytics (Phase 11)
# ---------------------------------------------------------------------------


@router.get("/campaigns", dependencies=[Depends(require_admin)])
def list_campaigns(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    camps = db.query(Campaign).order_by(Campaign.created_at.desc()).limit(200).all()
    out = []
    for c in camps:
        m = campaign_metrics(db, c.id)
        out.append({
            "id": c.id, "name": c.name, "type": c.type, "created_at": c.created_at,
            "sent": m["sent"], "delivered": m["delivered"], "read": m["read"],
            "replied": m["replied"], "converted": m["converted"],
            "delivery_rate": m["delivery_rate"], "read_rate": m["read_rate"],
        })
    return out


@router.get("/campaigns/{campaign_id}", dependencies=[Depends(require_admin)])
def campaign_detail(campaign_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    metrics = campaign_metrics(db, campaign_id)
    msgs = (
        db.query(CampaignMessage).filter(CampaignMessage.campaign_id == campaign_id)
        .order_by(CampaignMessage.sent_at.desc()).limit(300).all()
    )
    recipients = [
        {
            "phone": m.phone, "status": m.status,
            "sent_at": m.sent_at, "delivered_at": m.delivered_at,
            "read_at": m.read_at, "replied_at": m.replied_at, "error": m.error,
        }
        for m in msgs
    ]
    return {
        "campaign": {
            "id": c.id, "name": c.name, "type": c.type, "body": c.body,
            "audience_filters": json_loads(c.audience_filters, None),
            "created_at": c.created_at, "sequence_id": c.sequence_id,
        },
        "metrics": metrics,
        "recipients": recipients,
    }


@router.delete("/campaigns/{campaign_id}", dependencies=[Depends(require_admin)])
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    db.query(CampaignMessage).filter(CampaignMessage.campaign_id == campaign_id).delete()
    db.query(CampaignEvent).filter(CampaignEvent.campaign_id == campaign_id).delete()
    db.delete(c)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Click tracking analytics (Phase 12)
# ---------------------------------------------------------------------------


@router.get("/campaigns/{campaign_id}/clicks", dependencies=[Depends(require_admin)])
def campaign_clicks(campaign_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    clicks = db.query(TrackedClick).filter(TrackedClick.campaign_id == campaign_id).all()
    metrics = campaign_metrics(db, campaign_id)
    return {
        "total_clicks": len(clicks),
        "unique_clicks": metrics["unique_clicks"],
        "ctr": metrics["ctr"],
        "clicks": [
            {"phone": c.phone, "clicked_at": c.clicked_at, "user_agent": c.user_agent}
            for c in sorted(clicks, key=lambda x: x.clicked_at, reverse=True)[:100]
        ],
    }


@router.get("/tracking/overview", dependencies=[Depends(require_admin)])
def tracking_overview(db: Session = Depends(get_db)) -> dict[str, Any]:
    clicks = db.query(TrackedClick).all()
    return {
        "total_clicks": len(clicks),
        "unique_clicks": len({c.phone for c in clicks if c.phone}),
        "by_campaign": _count_by(clicks, "campaign_id"),
    }


def _count_by(rows: list, attr: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in rows:
        k = str(getattr(r, attr))
        out[k] = out.get(k, 0) + 1
    return out

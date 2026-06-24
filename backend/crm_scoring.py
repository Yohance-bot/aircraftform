"""Heat scoring engine (Phase 2).

Recomputes a lead's heat score from their message history using a small set
of explainable rules. Point values are editable via CRM settings. The score
and a human-readable list of reasons are stored on the Conversation row and a
``score_changed`` timeline event is logged when the score moves.

Rules:
  asked about price          +10
  asked about dates          +10
  5+ messages on same topic  +15
  filled registration form   +30
  asked same question twice  +20
  inactive for 3+ days       -10
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from conversation_models import Conversation, Message
from crm_service import (
    get_setting,
    heat_category,
    json_dumps,
    json_loads,
    log_timeline,
)
from models import Registration

logger = logging.getLogger("amc.crm.scoring")

_PRICE_PATTERNS = re.compile(
    r"\b(price|cost|fee|fees|charge|charges|how much|rupees|rs\.?|₹|amount|pricing|expensive)\b",
    re.IGNORECASE,
)
_DATE_PATTERNS = re.compile(
    r"\b(date|dates|when|schedule|timing|slot|batch|start|starts|begin|month|"
    r"april|may|june|july|august|weekend|day)\b",
    re.IGNORECASE,
)

# Coarse topic keywords used for the "5+ messages on same topic" rule.
_TOPIC_KEYWORDS = {
    "price": _PRICE_PATTERNS,
    "dates": _DATE_PATTERNS,
    "location": re.compile(r"\b(where|location|address|venue|reach|directions?)\b", re.IGNORECASE),
    "registration": re.compile(r"\b(register|registration|enroll|sign ?up|book|booking|form)\b", re.IGNORECASE),
    "kits": re.compile(r"\b(kit|kits|drone|plane|rc|parts|glider|balsa|build)\b", re.IGNORECASE),
}


def _normalize_question(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9 ]", "", (text or "").lower()).strip()
    return re.sub(r"\s+", " ", cleaned)


def _last_n_digits(phone: str | None, n: int = 10) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-n:] if len(digits) >= n else digits


def _has_registration(db: Session, phone: str) -> bool:
    tail = _last_n_digits(phone)
    if not tail:
        return False
    try:
        return (
            db.query(Registration)
            .filter(Registration.phone.like(f"%{tail}%"))
            .first()
            is not None
        )
    except Exception:  # pragma: no cover - defensive
        return False


def compute_score(db: Session, phone: str) -> dict[str, Any]:
    """Compute (without persisting) the heat score and reasons for a phone."""
    rules = get_setting(db, "scoring_rules") or {}
    thresholds = get_setting(db, "heat_thresholds")

    inbound = (
        db.query(Message)
        .filter(Message.phone == phone, Message.direction == "in")
        .order_by(Message.timestamp.asc())
        .all()
    )
    texts = [m.body or "" for m in inbound]

    reasons: list[dict[str, Any]] = []
    score = 0

    def add(rule_key: str, label: str) -> None:
        nonlocal score
        pts = int(rules.get(rule_key, 0))
        if pts == 0:
            return
        score += pts
        reasons.append({"rule": rule_key, "label": label, "points": pts})

    joined = " \n ".join(texts)

    if _PRICE_PATTERNS.search(joined):
        add("asked_price", "Asked about price")
    if _DATE_PATTERNS.search(joined):
        add("asked_dates", "Asked about dates / schedule")

    # 5+ messages discussing the same topic.
    topic_counts: Counter[str] = Counter()
    for t in texts:
        for topic, pattern in _TOPIC_KEYWORDS.items():
            if pattern.search(t):
                topic_counts[topic] += 1
    deep_topic = next((tp for tp, c in topic_counts.items() if c >= 5), None)
    if deep_topic:
        add("deep_topic", f"5+ messages about {deep_topic}")

    # Asked the same question twice (repeated normalized inbound text).
    normalized = [
        _normalize_question(t) for t in texts if len(_normalize_question(t)) >= 8
    ]
    repeats = [q for q, c in Counter(normalized).items() if c >= 2]
    if repeats:
        add("repeat_question", "Asked the same question more than once")

    if _has_registration(db, phone):
        add("form_filled", "Filled registration form")

    # Inactivity penalty: last inbound message older than 3 days.
    if inbound:
        last_in = inbound[-1].timestamp
        if last_in and (datetime.utcnow() - last_in) > timedelta(days=3):
            add("inactive_3d", "Inactive for 3+ days")

    score = max(0, score)
    return {
        "score": score,
        "category": heat_category(score, thresholds),
        "reasons": reasons,
    }


def recompute_score(
    db: Session,
    phone: str,
    *,
    actor: str | None = None,
    commit: bool = True,
) -> dict[str, Any]:
    """Compute, persist and (if changed) log the heat score for a contact."""
    conv = db.query(Conversation).filter(Conversation.phone == phone).first()
    if conv is None:
        return {"score": 0, "category": "cold", "reasons": []}

    result = compute_score(db, phone)
    previous = conv.heat_score or 0
    new_score = result["score"]

    conv.heat_score = new_score
    conv.score_reasons = json_dumps(result["reasons"])
    conv.updated_at = datetime.utcnow()

    if new_score != previous:
        log_timeline(
            db,
            phone,
            "score_changed",
            f"Heat score {previous} → {new_score} ({result['category']})",
            actor=actor or "system",
            meta={"from": previous, "to": new_score, "category": result["category"]},
            commit=False,
        )

    if commit:
        try:
            db.commit()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to persist score for %s: %s", phone, exc)
            db.rollback()
    return result

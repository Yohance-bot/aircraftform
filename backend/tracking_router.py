"""Public click-tracking redirect endpoint (Phase 12).

GET /track/{token} records the click (contact, campaign, timestamp, user
agent) and 302-redirects to the original target URL. No auth — these links
are shared with leads over WhatsApp. Always redirects somewhere sensible even
on bad/expired tokens so a lead is never shown an error page.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from marketing_service import record_click

logger = logging.getLogger("amc.tracking")

router = APIRouter()

_FALLBACK_URL = "https://amcairmodelcrafts.com"


@router.get("/track/{token}")
def track_click(token: str, request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    try:
        ua = request.headers.get("user-agent")
        target = record_click(db, token, ua)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("track_click failed for %s: %s", token, exc)
        target = None
    return RedirectResponse(url=target or _FALLBACK_URL, status_code=302)

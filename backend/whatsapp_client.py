"""Single async entrypoint for every WhatsApp Cloud API call.

Two modes:

* Normal (default): POSTs the payload to the Meta Graph API.
* Capture (dry-run): if a list has been installed in the
  `whatsapp_capture` context var, the payload is appended to it and
  the network is never touched. This is what powers
  `POST /api/test-bot` in simulate mode.

By design this function NEVER raises. On any error (bad config,
network failure, non-2xx from Meta) it logs and returns ``None``,
so a failing WhatsApp call can never break a webhook handler or
the registration form.
"""

from __future__ import annotations

import contextvars
import logging
import os

import httpx

logger = logging.getLogger("amc.whatsapp")

GRAPH_API_VERSION = "v18.0"

# Context var consumed by the dry-run "capture" mode used by /api/test-bot.
# When set to a list, send_whatsapp() appends payloads to it instead of
# POSTing them. The default is None (= live mode).
whatsapp_capture: contextvars.ContextVar[list | None] = contextvars.ContextVar(
    "whatsapp_capture", default=None
)


def _meta_url() -> str | None:
    phone_number_id = os.getenv("PHONE_NUMBER_ID", "").strip()
    if not phone_number_id:
        return None
    return f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"


async def send_whatsapp(payload: dict) -> dict | None:
    """POST a payload to the WhatsApp Cloud API (or capture it in dry-run).

    Returns the Meta response JSON on success, ``{"captured": True}``
    when running under a capture context, and ``None`` on any error.
    """
    capture = whatsapp_capture.get()
    if capture is not None:
        capture.append(payload)
        return {"captured": True}

    url = _meta_url()
    access_token = os.getenv("ACCESS_TOKEN", "").strip()
    if not url or not access_token:
        logger.warning(
            "send_whatsapp skipped: PHONE_NUMBER_ID or ACCESS_TOKEN not configured"
        )
        return None

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=payload)
        if response.status_code >= 400:
            logger.error(
                "Meta API error %s for payload type=%s: %s",
                response.status_code,
                payload.get("type"),
                response.text[:500],
            )
            return None
        try:
            return response.json()
        except ValueError:
            return None
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("send_whatsapp transport failure: %s", exc)
        return None

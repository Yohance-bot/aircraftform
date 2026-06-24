"""Background scheduler for drip automation (Phase 10).

The backend is a continuously-running uvicorn web service, so the most
architecture-appropriate scheduler is a single asyncio background task started
on app startup — no new dependency required. It wakes every
``DRIP_INTERVAL_SECONDS`` (default 60s) and processes due scheduled messages.

A cron-compatible escape hatch is also exposed via
``POST /api/crm/drip/run-due`` (see marketing_router) so the same logic can be
driven by Render Cron if the web service is ever scaled to zero.

Set ``DRIP_SCHEDULER_ENABLED=0`` to disable the in-process loop (e.g. when
relying purely on cron, or in tests).
"""

from __future__ import annotations

import asyncio
import logging
import os

from database import SessionLocal
from marketing_service import process_due

logger = logging.getLogger("amc.scheduler")

_task: asyncio.Task | None = None


def _interval() -> int:
    try:
        return max(15, int(os.getenv("DRIP_INTERVAL_SECONDS", "60")))
    except ValueError:
        return 60


async def _loop() -> None:
    interval = _interval()
    logger.info("Drip scheduler started (interval=%ss)", interval)
    while True:
        try:
            db = SessionLocal()
            try:
                result = await process_due(db)
                if result.get("processed"):
                    logger.info("Drip scheduler processed %s", result)
            finally:
                db.close()
        except asyncio.CancelledError:  # pragma: no cover
            raise
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Drip scheduler tick failed: %s", exc)
        await asyncio.sleep(interval)


def start_scheduler() -> None:
    """Start the background loop if enabled and not already running."""
    global _task
    if os.getenv("DRIP_SCHEDULER_ENABLED", "1") == "0":
        logger.info("Drip scheduler disabled via DRIP_SCHEDULER_ENABLED=0")
        return
    if _task and not _task.done():
        return
    try:
        _task = asyncio.create_task(_loop())
    except RuntimeError:
        # No running event loop (e.g. sync test context) — cron endpoint still works.
        logger.info("No running event loop; drip scheduler loop not started.")

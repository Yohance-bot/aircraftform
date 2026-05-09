"""API router for knowledge base CRUD operations.

All endpoints except /api/knowledge/export require admin authentication
via X-Admin-Key header.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from conversation_models import KnowledgeEntry
from database import get_db

logger = logging.getLogger("amc.knowledge")

router = APIRouter()

ADMIN_KEY = os.getenv("ADMIN_KEY", "change-me-before-deploy")


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    """Dependency that enforces admin authentication via header."""
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key.",
        )


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class KnowledgeEntryOut(BaseModel):
    id: int
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreateKnowledgeEntry(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1)


class UpdateKnowledgeEntry(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------


def seed_knowledge_if_empty(db: Session) -> None:
    """Seed the knowledge_entries table from faq_knowledge.txt if empty."""
    try:
        count = db.query(KnowledgeEntry).count()
        if count > 0:
            return

        faq_path = Path(__file__).with_name("faq_knowledge.txt")
        if not faq_path.exists():
            logger.warning("faq_knowledge.txt not found, skipping seed")
            return

        content = faq_path.read_text(encoding="utf-8")
        entry = KnowledgeEntry(title="Camp FAQ", content=content)
        db.add(entry)
        db.commit()
        logger.info("Seeded knowledge_entries with Camp FAQ")
    except Exception as exc:
        logger.exception("Failed to seed knowledge_entries: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/api/knowledge",
    response_model=list[KnowledgeEntryOut],
    dependencies=[Depends(require_admin)],
)
def list_knowledge_entries(db: Session = Depends(get_db)) -> list[KnowledgeEntry]:
    """List all knowledge entries ordered by created_at desc."""
    return (
        db.query(KnowledgeEntry)
        .order_by(KnowledgeEntry.created_at.desc())
        .all()
    )


@router.post(
    "/api/knowledge",
    response_model=KnowledgeEntryOut,
    dependencies=[Depends(require_admin)],
)
def create_knowledge_entry(
    payload: CreateKnowledgeEntry,
    db: Session = Depends(get_db),
) -> KnowledgeEntry:
    """Create a new knowledge entry."""
    entry = KnowledgeEntry(
        title=payload.title.strip(),
        content=payload.content.strip(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch(
    "/api/knowledge/{entry_id}",
    response_model=KnowledgeEntryOut,
    dependencies=[Depends(require_admin)],
)
def update_knowledge_entry(
    entry_id: int,
    payload: UpdateKnowledgeEntry,
    db: Session = Depends(get_db),
) -> KnowledgeEntry:
    """Update an existing knowledge entry."""
    entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge entry not found.",
        )

    if payload.title is not None:
        entry.title = payload.title.strip()
    if payload.content is not None:
        entry.content = payload.content.strip()

    entry.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(entry)
    return entry


@router.delete(
    "/api/knowledge/{entry_id}",
    dependencies=[Depends(require_admin)],
)
def delete_knowledge_entry(
    entry_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """Delete a knowledge entry."""
    entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge entry not found.",
        )

    db.delete(entry)
    db.commit()
    return {"success": True}


@router.get("/api/knowledge/export")
def export_knowledge(db: Session = Depends(get_db)) -> PlainTextResponse:
    """Export all knowledge entries as plain text blob.

    No auth required — used internally by groq_agent.
    Format: "## {title}\n{content}\n\n" for each entry.
    """
    entries = (
        db.query(KnowledgeEntry)
        .order_by(KnowledgeEntry.created_at.asc())
        .all()
    )
    text_parts = []
    for entry in entries:
        text_parts.append(f"## {entry.title}\n{entry.content}\n")
    return PlainTextResponse("\n".join(text_parts))

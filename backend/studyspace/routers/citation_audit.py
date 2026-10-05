"""Citation Audit — batch verify all citations in a space."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException

from studyspace.deps import DbDep, UserDep
from studyspace.models.ai_intelligence import (
    CitationAuditStatus, CitationAuditItem, CitationAuditReport, CitationAuditRequest,
)

router = APIRouter(prefix="/spaces", tags=["citation-audit"])


@router.post("/{space_id}/citation-audit", response_model=CitationAuditReport)
async def audit_citations(
    db: DbDep,
    space_id: UUID,
    body: CitationAuditRequest,
) -> CitationAuditReport:
    """Audit all citations in a space (or filtered subset)."""
    # Verify ownership
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")

    # Build query
    query = """
        select
            c.id as citation_id,
            c.message_id,
            c.chunk_id,
            c.label,
            c.quote_span as quote,
            c.score,
            c.verified,
            c.created_at,
            ch.source_id,
            s.title as source_title,
            s.updated_at as source_updated_at
        from public.citations c
        join public.chunks ch on ch.id = c.chunk_id
        join public.sources s on s.id = ch.source_id
        where s.space_id = $1
    """
    params = [str(space_id)]

    if body.since:
        query += " and c.created_at >= $2"
        params.append(body.since.isoformat())

    query += " order by c.created_at desc limit 10000"

    rows = await db.fetch(query, *params)

    items: list[CitationAuditItem] = []
    for r in rows:
        status = CitationAuditStatus.verified
        details = "Citation maps to valid chunk with good score."

        if r["chunk_id"] is None:
            status = CitationAuditStatus.missing_chunk
            details = "Chunk not found (may have been deleted)."
        elif r["source_updated_at"] and r["created_at"] and r["source_updated_at"] > r["created_at"]:
            status = CitationAuditStatus.stale
            details = "Source was updated after citation was created."
        elif r["score"] < 0.3:
            status = CitationAuditStatus.low_score
            details = f"Low retrieval score ({r['score']:.2f})."

        items.append(CitationAuditItem(
            message_id=r["message_id"],
            chunk_id=r["chunk_id"],
            source_id=r["source_id"],
            source_title=r["source_title"],
            label=r["label"],
            quote=r["quote"] or "",
            score=r["score"],
            verified=r["verified"],
            status=status,
            details=details,
            created_at=r["created_at"],
            source_updated_at=r["source_updated_at"],
        ))

    verified = sum(1 for i in items if i.status == CitationAuditStatus.verified)
    issues = len(items) - verified

    return CitationAuditReport(
        space_id=space_id,
        total_citations=len(items),
        verified=verified,
        issues=issues,
        items=items,
        generated_at=datetime.utcnow(),
    )
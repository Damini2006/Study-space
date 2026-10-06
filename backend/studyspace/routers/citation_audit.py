"""Citation Audit — re-verify every citation attached to an answer.

The audit answers one question: *can the user still check this claim?* A
citation stops being trustworthy in four ways, and each has a different fix for
the reader:

- ``missing_chunk`` — the cited chunk was deleted. The reader can no longer open
  the evidence, so the sentence is now unsourced.
- ``broken`` — the whole source is gone, which invalidates every citation into
  it at once.
- ``stale`` — the source was edited *after* the answer was written, so the
  passage may no longer say what the answer claims it says.
- ``low_score`` — the citation was weak on its face: the retrieved passage
  barely matched the question.

Detecting the first two requires the citation row to outlive its chunk, which is
why ``citations.chunk_id`` is nullable with ``on delete set null`` (migration
0010). ``space_id`` and ``source_title`` are snapshotted onto the citation for
the same reason: once the source is deleted there is no join path left to find
out which space or which document it belonged to.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException

from studyspace.deps import DbDep
from studyspace.models.ai_intelligence import (
    CitationAuditItem,
    CitationAuditReport,
    CitationAuditRequest,
    CitationAuditStatus,
)

router = APIRouter(prefix="/spaces", tags=["citation-audit"])

# Below this the retrieved passage was a poor match for the question, so the
# citation was never strong evidence even though it resolves.
LOW_SCORE_CUTOFF = 0.30

# An audit over a huge space should still return promptly; rows are ordered
# newest-first so the truncation drops the least relevant history.
MAX_ITEMS = 2_000


def _classify(
    chunk_id: UUID | None,
    source_id: UUID | None,
    source_updated_at: datetime | None,
    created_at: datetime | None,
    score: float | None,
    verified: bool,
) -> tuple[CitationAuditStatus, str]:
    """Map one citation row onto a status and a human explanation.

    Order matters: a citation whose evidence is gone is reported as gone, not as
    a weak match, because "the passage may not support this" is a much weaker
    warning than "you cannot open the passage at all".
    """
    if chunk_id is None:
        return (
            CitationAuditStatus.broken if source_id is None else CitationAuditStatus.missing_chunk,
            "The cited source was deleted — this citation can no longer be checked."
            if source_id is None
            else "The cited passage was deleted from the source.",
        )

    if source_updated_at and created_at and source_updated_at > created_at:
        return (
            CitationAuditStatus.stale,
            "The source was edited after this answer was written, so the passage "
            "may no longer say what the answer claims.",
        )

    if not verified:
        return (
            CitationAuditStatus.low_score,
            "Citation validation did not confirm this passage at answer time.",
        )

    if score is not None and score < LOW_SCORE_CUTOFF:
        return (
            CitationAuditStatus.low_score,
            f"Retrieved weakly when the answer was written (score {score:.2f}).",
        )

    return (
        CitationAuditStatus.verified,
        "The passage still exists and has not changed since the answer.",
    )


@router.post("/{space_id}/citation-audit", response_model=CitationAuditReport)
async def audit_citations(
    db: DbDep,
    space_id: UUID,
    body: CitationAuditRequest | None = None,
) -> CitationAuditReport:
    """Re-verify every citation in a space, or a filtered subset of them."""
    # The citation rows carry `space_id`, but verify ownership up front so a
    # missing snapshot can't leak another space's (or another user's) report.
    owned = await db.fetchval(
        "select 1 from public.spaces where id = $1 and user_id = auth.uid()", space_id
    )
    if owned is None:
        raise HTTPException(status_code=404, detail="Space not found.")

    since = body.since if body else None
    # asyncpg needs a real array for `= any($n)`; a bare list of str would fail
    # to infer the uuid[] parameter type.
    source_ids = (
        [str(s) for s in body.source_ids] if body and body.source_ids else None
    )

    # LEFT JOINs throughout: the whole point is to report citations whose chunks
    # or sources no longer exist, so an inner join would hide exactly the rows
    # this endpoint exists to surface.
    rows = await db.fetch(
        """
        select
            c.id            as citation_id,
            c.message_id,
            c.chunk_id,
            c.source_id,
            coalesce(c.source_title, s.title) as source_title,
            c.label,
            c.quote_span    as quote,
            c.score,
            c.verified,
            c.created_at,
            s.updated_at    as source_updated_at
        from public.citations c
        left join public.chunks  ch on ch.id = c.chunk_id
        left join public.sources s  on s.id  = coalesce(c.source_id, ch.source_id)
        where c.space_id = $1
          and ($2::timestamptz is null or c.created_at >= $2)
          and ($3::uuid[]   is null or c.source_id = any($3))
        order by c.created_at desc
        limit $4
        """,
        space_id,
        since,
        source_ids,
        # Fetch one extra row so we can tell "exactly at the cap" from
        # "truncated" without a second count query.
        MAX_ITEMS + 1,
    )
    truncated = len(rows) > MAX_ITEMS
    rows = rows[:MAX_ITEMS]

    items: list[CitationAuditItem] = []
    for r in rows:
        status, details = _classify(
            chunk_id=r["chunk_id"],
            source_id=r["source_id"],
            source_updated_at=r["source_updated_at"],
            created_at=r["created_at"],
            score=r["score"],
            verified=r["verified"],
        )
        items.append(
            CitationAuditItem(
                citation_id=r["citation_id"],
                message_id=r["message_id"],
                # chunk_id / source_id stay null when the evidence is gone —
                # inventing a placeholder id here would produce a link that
                # 404s, which is worse than admitting there is nothing to link.
                chunk_id=r["chunk_id"],
                source_id=r["source_id"],
                source_title=r["source_title"] or "(deleted source)",
                label=r["label"],
                quote=r["quote"] or "",
                score=r["score"],
                verified=r["verified"],
                status=status,
                details=details,
                created_at=r["created_at"],
                source_updated_at=r["source_updated_at"],
            )
        )

    verified = sum(1 for i in items if i.status == CitationAuditStatus.verified)
    return CitationAuditReport(
        space_id=space_id,
        total_citations=len(items),
        verified=verified,
        issues=len(items) - verified,
        truncated=truncated,
        items=items,
        generated_at=datetime.now(timezone.utc),
    )

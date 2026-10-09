"""Search: hybrid retrieval over a space's sources, as JSON.

Chat, studio and evals all reach retrieval through
``services.retrieval.hybrid_search``; this route exposes the same entry
point directly, so "search" costs one embedding and one SQL query
instead of a whole RAG answer — and so the MCP ``search_sources`` tool
has a contract matching what its docstring promises (the chat endpoint
it used to call only ever answers with an SSE stream, which the old
tool tried to ``.json()``).

A GET, deliberately: retrieval changes nothing, and the token scope
rule (reads need ``read``, everything mutating needs ``write``) then
lets a read-only MCP token search instead of demanding write.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from studyspace.deps import DbDep, UserDep
from studyspace.models.search import SearchHit, SearchResponse
from studyspace.services.embeddings import embed_query
from studyspace.services.retrieval import hybrid_search

router = APIRouter(tags=["search"])


@router.get("/spaces/{space_id}/search", response_model=SearchResponse)
async def search_space(
    space_id: uuid.UUID,
    user: UserDep,
    db: DbDep,
    q: str = Query(min_length=1, max_length=2000),
    limit: int = Query(default=10, ge=1, le=50),
    source_ids: Annotated[list[uuid.UUID] | None, Query(max_length=50)] = None,
) -> SearchResponse:
    """Hybrid (vector + full-text) search across one space's sources."""
    # Visibility first, under the caller's own RLS: a space you cannot see
    # is a 404 before any embedding cost is spent.
    visible = await db.fetchrow("select 1 from public.spaces where id = $1", space_id)
    if visible is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Space not found")
    query_embedding = await embed_query(q)
    candidates = await hybrid_search(
        db,
        query_text=q,
        query_embedding=query_embedding,
        space_id=str(space_id),
        source_ids=[str(s) for s in (source_ids or [])] or None,
        top_k=limit,
    )
    return SearchResponse(
        results=[
            SearchHit(
                chunk_id=uuid.UUID(c.chunk_id),
                source_id=uuid.UUID(c.source_id),
                source_title=c.source_title,
                content=c.content,
                page=c.page,
                fused_score=c.fused_score,
                final_score=c.final_score,
                rank=int(c.metadata.get("rank", i + 1)),
            )
            for i, c in enumerate(candidates)
        ]
    )

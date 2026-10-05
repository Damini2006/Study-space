"""Per-space RAG Settings."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from uuid import UUID

from studyspace.deps import DbDep, UserDep
from studyspace.models.ai_intelligence import RagSettings, RagSettingsUpdate

router = APIRouter(prefix="/spaces", tags=["rag"])


@router.get("/{space_id}/rag", response_model=dict)
async def get_rag_settings(db: DbDep, space_id: UUID) -> dict:
    """Get RAG settings for a space (merged with global defaults)."""
    # Verify ownership
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")

    row = await db.fetchrow(
        "select * from public.rag_settings where space_id = $1", space_id
    )
    if row is None:
        # Return defaults
        from studyspace.config import get_settings
        s = get_settings()
        return {
            "space_id": str(space_id),
            "top_k": s.rag_top_k,
            "vector_weight": 0.7,
            "fts_weight": 0.3,
            "rrf_k": 60,
            "rerank_enabled": True,
            "rerank_model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
            "rerank_top_n": 8,
            "relevance_gate": s.layer_relevance_gate,
            "relevance_threshold": s.relevance_threshold,
            "citation_validation": s.layer_citation_validation,
            "claim_verification": s.layer_claim_verification,
            "temperature": 0.3,
            "max_tokens": 2048,
            "socratic_mode": False,
            "chat_model": None,
            "judge_model": None,
            "generate_model": None,
        }
    return dict(row)


@router.patch("/{space_id}/rag", response_model=dict)
async def update_rag_settings(
    db: DbDep, space_id: UUID, body: dict
) -> dict:
    """Update per-space RAG settings."""
    # Verify ownership
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")

    # Build update
    allowed = {
        "top_k", "vector_weight", "fts_weight", "rrf_k",
        "rerank_enabled", "rerank_model", "rerank_top_n",
        "relevance_gate", "relevance_threshold",
        "citation_validation", "claim_verification",
        "temperature", "max_tokens", "socratic_mode",
        "chat_model", "judge_model", "generate_model",
    }
    fields = {k: v for k, v in body.items() if k in allowed}
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields to update.")

    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"insert into public.rag_settings (space_id, {', '.join(fields.keys())}) "
        f"values ($1, {', '.join(f'${i + 2}' for i in range(len(fields)))}) "
        f"on conflict (space_id) do update set {', '.join(f'{k} = excluded.{k}' for k in fields)} "
        f"returning *",
        space_id, *fields.values(),
    )
    return dict(row)


@router.delete("/{space_id}/rag", status_code=204)
async def reset_rag_settings(db: DbDep, space_id: UUID) -> None:
    """Reset to global defaults."""
    row = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")
    await db.execute("delete from public.rag_settings where space_id = $1", space_id)
"""Per-space RAG tuning.

Retrieval quality is a per-subject decision: a law student wants a high
relevance threshold and few passages, someone surveying a new field wants wide
recall. Global defaults can't serve both, so this layer lets a space override
them — and, just as importantly, reports which values are actually in force so
the Settings panel can distinguish a tuned value from a default.

`resolved` in the response is the merged view the pipeline runs with. It is the
field the UI should render, not the raw row.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException

from studyspace.config import get_settings
from studyspace.deps import DbDep
from studyspace.models.ai_intelligence import (
    RagSettings,
    RagSettingsResolved,
    RagSettingsUpdate,
)
from studyspace.services.rag_config import global_rag_config

router = APIRouter(prefix="/spaces", tags=["rag"])


# Fields the user may change. Kept explicit (rather than `model_dump`) so a new
# field added to the model can't silently become writable before it's validated
# in the DB.
_UPDATABLE = set(RagSettingsUpdate.model_fields)

# Which arm of the hybrid score each weight controls. Spelled out rather than
# inferred from the field name: this used to pick the arm with a ternary and had
# the two labels swapped, so the error told people that zeroing the *full-text*
# weight would disable *semantic* search — the one thing they needed to know,
# stated backwards.
_WEIGHT_ARMS = {
    "vector_weight": "semantic",
    "fts_weight": "full-text",
}


def _defaults(space_id: UUID) -> dict[str, Any]:
    """The global baseline, shaped as a `RagSettings` row would be.

    Derived from `global_rag_config()` — the exact object the answer pipeline
    reads — so the settings panel cannot show a default the pipeline doesn't
    use. `RagConfig` carries every tuning knob; the rest here are the columns it
    deliberately doesn't care about.
    """
    cfg = global_rag_config().model_dump()
    return {
        "space_id": space_id,
        "rerank_model": get_settings().reranker_model,
        "created_at": None,
        "updated_at": None,
        **cfg,
    }


def _validate_weights(row: dict[str, Any]) -> None:
    """Reject weights that would zero out half the hybrid score.

    RRF normalises by the weights' sum, so (1.0, 0.0) silently disables full-text
    search rather than erroring — a space would stop matching on keywords and
    nobody would know why. Keeping a floor on each side makes the intent explicit.
    """
    for field, arm in _WEIGHT_ARMS.items():
        value = row.get(field)
        if value is not None and not (0.05 <= float(value) <= 1.0):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{field} must be between 0.05 and 1.0 — a weight of 0 disables "
                    f"{arm} search entirely, which is rarely what you want."
                ),
            )


async def _load(db: DbDep, space_id: UUID) -> dict[str, Any] | None:
    return await db.fetchrow(
        "select * from public.rag_settings where space_id = $1", space_id
    )


async def _require_owned(db: DbDep, space_id: UUID) -> None:
    owned = await db.fetchval(
        "select 1 from public.spaces where id = $1 and user_id = auth.uid()", space_id
    )
    if owned is None:
        # 404 rather than 403: the caller shouldn't be able to probe which space
        # ids exist in someone else's account.
        raise HTTPException(status_code=404, detail="Space not found.")


def _respond(space_id: UUID, row: dict[str, Any] | None) -> RagSettingsResolved:
    # Both sides go through RagSettings before anything is compared, because
    # asyncpg returns `numeric` columns as Decimal and Decimal("0.70") != 0.70.
    # Comparing the raw row against the raw defaults reported every numeric
    # column as overridden on any space that had ever saved once, badge and all.
    # Deriving `resolved` first also makes the badge and the value agree by
    # construction: it is literally the value being reported that decides.
    resolved = RagSettings(**{**_defaults(space_id), **(row or {})})
    defaults = RagSettings(**_defaults(space_id))
    overrides = [
        field
        for field in sorted(_UPDATABLE)
        if getattr(resolved, field) != getattr(defaults, field)
    ]
    return RagSettingsResolved(
        resolved=resolved,
        overridden=overrides,
        is_default=row is None,
    )


@router.get("/{space_id}/rag", response_model=RagSettingsResolved)
async def get_rag_settings(db: DbDep, space_id: UUID) -> RagSettingsResolved:
    """Get the effective RAG config for a space, merged with global defaults."""
    await _require_owned(db, space_id)
    return _respond(space_id, await _load(db, space_id))


@router.patch("/{space_id}/rag", response_model=RagSettingsResolved)
async def update_rag_settings(
    db: DbDep, space_id: UUID, body: RagSettingsUpdate
) -> RagSettingsResolved:
    """Update per-space RAG settings, creating the row if absent."""
    await _require_owned(db, space_id)

    fields = {
        k: v
        for k, v in body.model_dump(exclude_unset=True, exclude_none=True).items()
        if k in _UPDATABLE
    }
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    existing = await _load(db, space_id)
    proposed = {**(_defaults(space_id) if existing is None else dict(existing)), **fields}
    _validate_weights(proposed)

    # Upsert rather than requiring the row to exist: the panel's first save should
    # just work. `excluded.` prefixes keep this correct whether it inserts or
    # updates, and later saves don't clobber fields this PATCH didn't mention.
    columns = ", ".join(fields)
    placeholders = ", ".join(f"${i + 2}" for i in range(len(fields)))
    updates = ", ".join(f"{k} = excluded.{k}" for k in fields)
    row = await db.fetchrow(
        f"insert into public.rag_settings (space_id, {columns}) "
        f"values ($1, {placeholders}) "
        f"on conflict (space_id) do update set {updates} "
        f"returning *",
        space_id,
        *fields.values(),
    )
    return _respond(space_id, row)


@router.delete("/{space_id}/rag", response_model=RagSettingsResolved)
async def reset_rag_settings(db: DbDep, space_id: UUID) -> RagSettingsResolved:
    """Drop the override row so the space falls back to global defaults."""
    await _require_owned(db, space_id)
    await db.execute("delete from public.rag_settings where space_id = $1", space_id)
    return _respond(space_id, None)

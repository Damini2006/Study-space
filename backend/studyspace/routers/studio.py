"""Studio generation endpoints."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException

from studyspace.config import get_settings
from studyspace.deps import DbDep, UserDep
from studyspace.models.studio import StudioGenerateRequest, StudioOutputOut, StudioUpdate
from studyspace.rate_limit import rate_limit
from studyspace.services.studio import _output_row, generate_studio_output

router = APIRouter(prefix="/spaces/{space_id}/studio", tags=["studio"])


@router.post("/generate", response_model=StudioOutputOut, status_code=201)
async def generate(
    space_id: uuid.UUID, body: StudioGenerateRequest, db: DbDep, user: UserDep
) -> StudioOutputOut:
    settings = get_settings()
    rl = await rate_limit(f"studio:{user.id}", settings.rate_limit_studio_per_10min, 600)
    if not rl.allowed:
        raise HTTPException(status_code=429, detail="Generation limit reached. Try again in a few minutes.")
    try:
        out = await generate_studio_output(
            db, user_id=user.id, space_id=str(space_id), request=body
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StudioOutputOut(**out)


@router.get("/outputs", response_model=list[StudioOutputOut])
async def list_outputs(space_id: uuid.UUID, db: DbDep) -> list[StudioOutputOut]:
    rows = await db.fetch(
        "select id, space_id, type, title, content, source_ids, created_at, updated_at "
        "from public.studio_outputs where space_id = $1 and user_id = auth.uid() "
        "order by updated_at desc limit 100",
        space_id,
    )
    return [StudioOutputOut(**_output_row(r)) for r in rows]


@router.get("/outputs/{output_id}", response_model=StudioOutputOut)
async def get_output(space_id: uuid.UUID, output_id: uuid.UUID, db: DbDep) -> StudioOutputOut:
    row = await db.fetchrow(
        "select id, space_id, type, title, content, source_ids, created_at, updated_at "
        "from public.studio_outputs where id = $1 and space_id = $2 and user_id = auth.uid()",
        output_id,
        space_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Output not found.")
    return StudioOutputOut(**_output_row(row))


@router.patch("/outputs/{output_id}", response_model=StudioOutputOut)
async def update_output(
    space_id: uuid.UUID, output_id: uuid.UUID, body: StudioUpdate, db: DbDep
) -> StudioOutputOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    if "content" in fields and fields["content"] is not None:
        fields["content"] = json.dumps(fields["content"])
    sets = ", ".join(f"{k} = ${i + 3}" for i, k in enumerate(fields))
    result = await db.execute(
        f"update public.studio_outputs set {sets} where id = $1 and space_id = $2 and user_id = auth.uid()",
        output_id,
        space_id,
        *fields.values(),
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Output not found.")
    row = await db.fetchrow(
        "select id, space_id, type, title, content, source_ids, created_at, updated_at "
        "from public.studio_outputs where id = $1",
        output_id,
    )
    return StudioOutputOut(**_output_row(row))


@router.delete("/outputs/{output_id}", status_code=204)
async def delete_output(space_id: uuid.UUID, output_id: uuid.UUID, db: DbDep) -> None:
    result = await db.execute(
        "delete from public.studio_outputs where id = $1 and space_id = $2 and user_id = auth.uid()",
        output_id,
        space_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Output not found.")

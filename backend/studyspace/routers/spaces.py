"""Spaces CRUD."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from studyspace.deps import DbDep, UserDep
from studyspace.models.spaces import SpaceCreate, SpaceOut, SpaceUpdate

router = APIRouter(prefix="/spaces", tags=["spaces"])

_SPACE_SELECT = """
select sp.id, sp.title, sp.description, sp.subject, sp.color, sp.archived,
       sp.created_at, sp.updated_at,
       (select count(*) from public.sources s where s.space_id = sp.id)::int as source_count,
       (select count(*) from public.sources s where s.space_id = sp.id and s.status = 'ready')::int as ready_source_count,
       (select count(*) from public.cards c where c.space_id = sp.id)::int as card_count,
       (select count(*) from public.card_state cs
          join public.cards c on c.id = cs.card_id
         where c.space_id = sp.id and cs.due <= now() and not cs.suspended)::int as due_today
from public.spaces sp
"""


def _to_out(row) -> SpaceOut:
    return SpaceOut(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        subject=row["subject"],
        color=row["color"],
        archived=row["archived"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        source_count=row["source_count"],
        ready_source_count=row["ready_source_count"],
        card_count=row["card_count"],
        due_today=row["due_today"],
    )


@router.get("", response_model=list[SpaceOut])
async def list_spaces(db: DbDep, include_archived: bool = False) -> list[SpaceOut]:
    rows = await db.fetch(
        _SPACE_SELECT + " where sp.user_id = auth.uid() and ($1 or not sp.archived) order by sp.created_at desc",
        include_archived,
    )
    return [_to_out(r) for r in rows]


@router.post("", response_model=SpaceOut, status_code=201)
async def create_space(db: DbDep, body: SpaceCreate) -> SpaceOut:
    row = await db.fetchrow(
        "insert into public.spaces (title, description, subject, color) "
        "values ($1, $2, $3, $4) returning id",
        body.title, body.description, body.subject, body.color,
    )
    out = await db.fetchrow(_SPACE_SELECT + " where sp.id = $1", row["id"])
    return _to_out(out)


@router.get("/{space_id}", response_model=SpaceOut)
async def get_space(db: DbDep, space_id: uuid.UUID) -> SpaceOut:
    row = await db.fetchrow(_SPACE_SELECT + " where sp.id = $1", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")
    return _to_out(row)


@router.patch("/{space_id}", response_model=SpaceOut)
async def update_space(db: DbDep, space_id: uuid.UUID, body: SpaceUpdate) -> SpaceOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    await db.execute(
        f"update public.spaces set {sets} where id = $1", space_id, *fields.values()
    )
    row = await db.fetchrow(_SPACE_SELECT + " where sp.id = $1", space_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Space not found.")
    return _to_out(row)


@router.delete("/{space_id}", status_code=204)
async def delete_space(db: DbDep, space_id: uuid.UUID) -> None:
    result = await db.execute("delete from public.spaces where id = $1", space_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Space not found.")

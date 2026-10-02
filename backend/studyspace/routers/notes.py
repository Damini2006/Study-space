"""Notes (TipTap rich text) with search, tags and pinning."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, Query

from studyspace.deps import DbDep
from studyspace.models.notes import NoteCreate, NoteOut, NoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"])


def _to_out(row) -> NoteOut:
    import json as _json
    content = row["content"]
    if isinstance(content, str):
        content = _json.loads(content)
    return NoteOut(
        id=row["id"],
        title=row["title"],
        content=content,
        content_text=row["content_text"],
        tags=list(row["tags"] or []),
        pinned=row["pinned"],
        color=row["color"],
        space_id=row["space_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("", response_model=list[NoteOut])
async def list_notes(
    db: DbDep,
    q: str | None = Query(default=None, max_length=200),
    tag: str | None = Query(default=None, max_length=40),
    space_id: uuid.UUID | None = None,
    sort: str = Query(default="updated", pattern="^(updated|created|pinned)$"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[NoteOut]:
    order = {"updated": "pinned desc, updated_at desc", "created": "created_at desc", "pinned": "pinned desc, updated_at desc"}[sort]
    rows = await db.fetch(
        "select * from public.notes where user_id = auth.uid() "
        "and ($1::text is null or title ilike '%' || $1 || '%' or content_text ilike '%' || $1 || '%') "
        "and ($2::text is null or $2 = any(tags)) "
        "and ($3::uuid is null or space_id = $3) "
        f"order by {order} limit $4",
        q, tag, space_id, limit,
    )
    return [_to_out(r) for r in rows]


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(db: DbDep, body: NoteCreate) -> NoteOut:
    row = await db.fetchrow(
        "insert into public.notes (title, content, content_text, tags, color, space_id, pinned) "
        "values ($1, $2::jsonb, $3, $4, $5, $6, $7) returning *",
        body.title, json.dumps(body.content), body.content_text, body.tags, body.color, body.space_id, body.pinned,
    )
    return _to_out(row)


@router.get("/{note_id}", response_model=NoteOut)
async def get_note(db: DbDep, note_id: uuid.UUID) -> NoteOut:
    row = await db.fetchrow(
        "select * from public.notes where id = $1 and user_id = auth.uid()", note_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Note not found.")
    return _to_out(row)


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(db: DbDep, note_id: uuid.UUID, body: NoteUpdate) -> NoteOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    if "content" in fields and fields["content"] is not None:
        fields["content"] = json.dumps(fields["content"])
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"update public.notes set {sets} where id = $1 and user_id = auth.uid() returning *",
        note_id,
        *fields.values(),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Note not found.")
    return _to_out(row)


@router.delete("/{note_id}", status_code=204)
async def delete_note(db: DbDep, note_id: uuid.UUID) -> None:
    result = await db.execute(
        "delete from public.notes where id = $1 and user_id = auth.uid()", note_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Note not found.")

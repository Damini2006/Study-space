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
    # content_text is derived from the jsonb document in SQL, so search and
    # exports see the text that was actually written. The client's own
    # content_text only stands in when the document yields no text at all
    # (content-less writers such as the MCP server).
    row = await db.fetchrow(
        "insert into public.notes (title, content, content_text, tags, color, space_id, pinned) "
        "values ($1, $2::jsonb, "
        "coalesce(nullif(public.jsonb_tiptap_text($2::jsonb), ''), $3, ''), "
        "$4, $5, $6, $7) returning *",
        body.title, json.dumps(body.content), body.content_text, body.tags, body.color, body.space_id, body.pinned,
    )
    return _to_out(row)


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(db: DbDep, note_id: uuid.UUID, body: NoteUpdate) -> NoteOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    params: list = [note_id]
    sets: list[str] = []

    def add(column: str, value, cast: str | None = None) -> int:
        params.append(value)
        idx = len(params)
        sets.append(f"{column} = ${idx}{cast or ''}")
        return idx

    if "content" in fields:
        content = fields.pop("content")
        if content is None:
            add("content", None)
        else:
            # A changed document re-derives its plain text — search and
            # exports read content_text, so a stale copy would hide the new
            # body. The client's content_text is only a fallback for
            # content-less writers; it never overwrites real document text.
            client_text = fields.pop("content_text", None)
            content_idx = add("content", json.dumps(content), "::jsonb")
            params.append(client_text)
            text_idx = len(params)
            sets.append(
                "content_text = coalesce(nullif(public.jsonb_tiptap_text("
                f"${content_idx}::jsonb), ''), ${text_idx}, '')"
            )

    for key, value in fields.items():
        add(key, value)

    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update.")
    row = await db.fetchrow(
        f"update public.notes set {', '.join(sets)} where id = $1 and user_id = auth.uid() returning *",
        *params,
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

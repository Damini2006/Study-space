"""Notes (TipTap rich text) with search, tags and pinning."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, Query

from studyspace.deps import DbDep
from studyspace.models.notes import (
    NoteBulkAction,
    NoteCreate,
    NoteFolderCreate,
    NoteFolderOut,
    NoteFolderUpdate,
    NoteOut,
    NoteRestoreVersion,
    NoteUpdate,
    NoteVersionOut,
)

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
        folder_id=row["folder_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# Keep the most recent of these per note; older ones are pruned so a
# long-lived note can't accumulate an unbounded history.
_MAX_VERSIONS = 20


async def _snapshot_version(db: DbDep, note_id: uuid.UUID) -> None:
    """Record the note's current state before an edit overwrites it.

    Runs inside the same transaction as the update, so a version only
    exists when the edit that prompted it did too.
    """
    row = await db.fetchrow(
        "select title, content, content_text, tags, color from public.notes where id = $1",
        note_id,
    )
    if row is None:
        return
    await db.execute(
        "insert into public.note_versions (note_id, user_id, title, content, content_text, tags, color) "
        "values ($1, auth.uid(), $2, $3, $4, $5, $6)",
        note_id, row["title"], row["content"], row["content_text"], row["tags"], row["color"],
    )
    # Prune to the newest _MAX_VERSIONS (keeps the latest, drops the oldest).
    await db.execute(
        "delete from public.note_versions where id in ("
        "  select id from public.note_versions where note_id = $1 "
        "  order by created_at desc offset $2"
        ")",
        note_id, _MAX_VERSIONS,
    )


def _folder_clause(db: DbDep, folder_id: uuid.UUID | None) -> str:
    """SQL asserting a folder belongs to the caller, so a foreign folder_id
    can't be smuggled in — it simply resolves to no folder and the note
    keeps its current one."""
    return "and exists (select 1 from public.note_folders f where f.id = $1 and f.user_id = auth.uid())" if folder_id is not None else ""


@router.get("", response_model=list[NoteOut])
async def list_notes(
    db: DbDep,
    q: str | None = Query(default=None, max_length=200),
    tag: str | None = Query(default=None, max_length=40),
    space_id: uuid.UUID | None = None,
    folder_id: uuid.UUID | None = None,
    sort: str = Query(default="updated", pattern="^(updated|created|pinned)$"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[NoteOut]:
    order = {"updated": "pinned desc, updated_at desc", "created": "created_at desc", "pinned": "pinned desc, updated_at desc"}[sort]
    # $5 is always referenced so the placeholder count is constant;
    # a null folder_id (or a folder that isn't the caller's) matches
    # nothing extra — the clause simply passes everything through.
    folder_ok = (
        "and ($5::uuid is null or (n.folder_id = $5 and exists "
        "(select 1 from public.note_folders f where f.id = $5 and f.user_id = auth.uid())))"
    )
    rows = await db.fetch(
        "select n.* from public.notes n where n.user_id = auth.uid() "
        "and ($1::text is null or n.title ilike '%' || $1 || '%' or n.content_text ilike '%' || $1 || '%') "
        "and ($2::text is null or $2 = any(n.tags)) "
        "and ($3::uuid is null or n.space_id = $3) "
        f"{folder_ok} "
        f"order by {order} limit $4",
        q, tag, space_id, limit, folder_id,
    )
    return [_to_out(r) for r in rows]


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(db: DbDep, body: NoteCreate) -> NoteOut:
    # content_text is derived from the jsonb document in SQL, so search and
    # exports see the text that was actually written. The client's own
    # content_text only stands in when the document yields no text at all
    # (content-less writers such as the MCP server).
    #
    # A folder_id is only honoured when it belongs to the caller; a
    # foreign id is dropped rather than rejected, so a stale client
    # reference can't create a note in someone else's folder.
    folder_id = body.folder_id
    if folder_id is not None:
        owns = await db.fetchval(
            "select id from public.note_folders where id = $1 and user_id = auth.uid()",
            folder_id,
        )
        if owns is None:
            folder_id = None
    row = await db.fetchrow(
        "insert into public.notes (title, content, content_text, tags, color, space_id, folder_id, pinned) "
        "values ($1, $2::jsonb, "
        "coalesce(nullif(public.jsonb_tiptap_text($2::jsonb), ''), $3, ''), "
        "$4, $5, $6, $7, $8) returning *",
        body.title, json.dumps(body.content), body.content_text, body.tags, body.color, body.space_id, folder_id, body.pinned,
    )
    return _to_out(row)


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(db: DbDep, note_id: uuid.UUID, body: NoteUpdate) -> NoteOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    # A folder_id is only honoured when it belongs to the caller;
    # a foreign id is dropped so a stale reference can't move a
    # note into someone else's folder.
    if "folder_id" in fields and fields["folder_id"] is not None:
        owns = await db.fetchval(
            "select id from public.note_folders where id = $1 and user_id = auth.uid()",
            fields["folder_id"],
        )
        if owns is None:
            fields["folder_id"] = None

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
            # exports read content_text, so a stale copy would hide the
            # new body. The client's content_text is only a fallback for
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

    # Snapshot the pre-edit state so a bad save can be undone.
    # Taken before the update, within the same request, so a
    # version only exists when the edit that prompted it did.
    await _snapshot_version(db, note_id)

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


# ---------------------------------------------------------------------------
# Version history
# ---------------------------------------------------------------------------
@router.get("/{note_id}/versions", response_model=list[NoteVersionOut])
async def list_versions(db: DbDep, note_id: uuid.UUID) -> list[NoteVersionOut]:
    # A note that isn't the caller's has no versions either way;
    # the join on user_id keeps the read scoped.
    rows = await db.fetch(
        "select id, note_id, title, content, content_text, tags, color, created_at "
        "from public.note_versions where note_id = $1 and user_id = auth.uid() "
        "order by created_at desc limit 100",
        note_id,
    )
    out = []
    for r in rows:
        content = r["content"]
        if isinstance(content, str):
            content = json.loads(content)
        out.append(
            NoteVersionOut(
                id=r["id"], note_id=r["note_id"], title=r["title"],
                content=content, content_text=r["content_text"],
                tags=list(r["tags"] or []), color=r["color"],
                created_at=r["created_at"],
            )
        )
    return out


@router.post("/{note_id}/restore", response_model=NoteOut)
async def restore_version(db: DbDep, note_id: uuid.UUID, body: NoteRestoreVersion) -> NoteOut:
    version = await db.fetchrow(
        "select title, content, content_text, tags, color from public.note_versions "
        "where id = $1 and note_id = $2 and user_id = auth.uid()",
        body.version_id, note_id,
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found.")
    # Snapshot the current state first, so restoring is itself
    # undoable — a mistaken restore doesn't destroy the present.
    await _snapshot_version(db, note_id)
    row = await db.fetchrow(
        "update public.notes set title = $2, content = $3::jsonb, content_text = $4, "
        "tags = $5, color = $6 where id = $1 and user_id = auth.uid() returning *",
        note_id, version["title"], version["content"], version["content_text"], version["tags"], version["color"],
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Note not found.")
    return _to_out(row)


# ---------------------------------------------------------------------------
# Related notes — others sharing at least one tag
# ---------------------------------------------------------------------------
@router.get("/{note_id}/related", response_model=list[NoteOut])
async def related_notes(db: DbDep, note_id: uuid.UUID, limit: int = Query(default=6, ge=1, le=50)) -> list[NoteOut]:
    rows = await db.fetch(
        "with target as ("
        "  select tags from public.notes where id = $1 and user_id = auth.uid()"
        "), scored as ("
        "  select n.*, "
        "    (select count(*) from unnest(n.tags) t join unnest((select tags from target)) ot on t = ot) as shared, "
        "    n.updated_at as n_updated "
        "  from public.notes n, target "
        "  where n.user_id = auth.uid() and n.id <> $1 "
        "    and n.tags && (select tags from target)"
        ") "
        "select * from scored order by shared desc, n_updated desc limit $2",
        note_id, limit,
    )
    return [_to_out(r) for r in rows]


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------
@router.get("/folders", response_model=list[NoteFolderOut])
async def list_folders(db: DbDep) -> list[NoteFolderOut]:
    rows = await db.fetch(
        "select f.id, f.name, f.created_at, "
        "  (select count(*) from public.notes n where n.folder_id = f.id) as note_count "
        "from public.note_folders f where f.user_id = auth.uid() "
        "order by f.created_at"
    )
    return [
        NoteFolderOut(id=r["id"], name=r["name"], note_count=r["note_count"], created_at=r["created_at"])
        for r in rows
    ]


@router.post("/folders", response_model=NoteFolderOut, status_code=201)
async def create_folder(db: DbDep, body: NoteFolderCreate) -> NoteFolderOut:
    row = await db.fetchrow(
        "insert into public.note_folders (name) values ($1) returning id, name, created_at",
        body.name,
    )
    return NoteFolderOut(id=row["id"], name=row["name"], note_count=0, created_at=row["created_at"])


@router.patch("/folders/{folder_id}", response_model=NoteFolderOut)
async def rename_folder(db: DbDep, folder_id: uuid.UUID, body: NoteFolderUpdate) -> NoteFolderOut:
    if not body.name:
        raise HTTPException(status_code=400, detail="No fields to update.")
    row = await db.fetchrow(
        "update public.note_folders set name = $2 where id = $1 and user_id = auth.uid() "
        "returning id, name, created_at",
        folder_id, body.name,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Folder not found.")
    count = await db.fetchval(
        "select count(*) from public.notes where folder_id = $1", folder_id
    )
    return NoteFolderOut(id=row["id"], name=row["name"], note_count=count, created_at=row["created_at"])


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(db: DbDep, folder_id: uuid.UUID) -> None:
    # Deleting a folder leaves its notes in place, folderless —
    # the notes are the user's data and are not collateral.
    result = await db.execute(
        "delete from public.note_folders where id = $1 and user_id = auth.uid()", folder_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Folder not found.")


# ---------------------------------------------------------------------------
# Bulk actions
# ---------------------------------------------------------------------------
@router.post("/bulk", response_model=list[NoteOut])
async def bulk_action(db: DbDep, body: NoteBulkAction) -> list[NoteOut]:
    ids = [str(i) for i in body.ids]

    if body.action == "delete":
        placeholders = ", ".join(f"${i + 1}" for i in range(len(ids)))
        result = await db.execute(
            f"delete from public.notes where id in ({placeholders}) and user_id = auth.uid()",
            *ids,
        )
        deleted = int(result.split(" ")[1])
        if deleted == 0:
            raise HTTPException(status_code=404, detail="No matching notes found.")
        return []

    if body.action == "move":
        folder_id = body.folder_id
        if folder_id is not None:
            owns = await db.fetchval(
                "select id from public.note_folders where id = $1 and user_id = auth.uid()",
                folder_id,
            )
            if owns is None:
                raise HTTPException(status_code=400, detail="Target folder not found.")
        placeholders = ", ".join(f"${i + 2}" for i in range(len(ids)))
        await db.execute(
            f"update public.notes set folder_id = $1 where id in ({placeholders}) and user_id = auth.uid()",
            folder_id, *ids,
        )
    elif body.action == "pin":
        if body.pinned is None:
            raise HTTPException(status_code=400, detail="Pinned value is required.")
        placeholders = ", ".join(f"${i + 2}" for i in range(len(ids)))
        await db.execute(
            f"update public.notes set pinned = $1 where id in ({placeholders}) and user_id = auth.uid()",
            body.pinned, *ids,
        )
    else:
        raise HTTPException(status_code=400, detail="Unknown action.")

    # Return the affected notes so the list can refresh from one
    # round-trip rather than refetching the whole library.
    placeholders = ", ".join(f"${i + 1}" for i in range(len(ids)))
    rows = await db.fetch(
        f"select * from public.notes where id in ({placeholders}) and user_id = auth.uid()",
        *ids,
    )
    return [_to_out(r) for r in rows]

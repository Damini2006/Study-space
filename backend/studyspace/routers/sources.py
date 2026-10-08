"""Source uploads: file → Supabase Storage → ARQ ingestion job.

Validation (type/size/filename/quota) happens here, server-side, before
anything reaches storage. Storage objects live under the user's own folder so
RLS on ``storage.objects`` allows only the owner to read them; temporary
access uses signed URLs.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from studyspace.config import get_settings
from studyspace.deps import DbDep
from studyspace.models.sources import PastedTextInput, SourceOut, UploadResponse
from studyspace.queue import enqueue_ingest
from studyspace.rate_limit import rate_limit
from studyspace.security import sanitize_filename, validate_upload
from studyspace.services.source_intake import (
    QuotaReached,
    StorageDeleteError,
    StorageUploadError,
    check_quota,
    create_source,
    delete_from_storage,
    upload_to_storage,
)

router = APIRouter(prefix="/spaces/{space_id}/sources", tags=["sources"])

_TYPE_BY_EXT = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".txt": "text",
    ".md": "markdown",
    ".markdown": "markdown",
}

_SOURCE_SELECT = """
select s.id, s.space_id, s.type, s.title, s.status, s.error, s.size_bytes, s.char_count,
       s.created_at, s.updated_at,
       (select count(*) from public.chunks c where c.source_id = s.id)::int as chunk_count
from public.sources s
"""


def _to_out(row) -> SourceOut:
    return SourceOut(
        id=row["id"],
        space_id=row["space_id"],
        type=row["type"],
        title=row["title"],
        status=row["status"],
        error=row["error"],
        size_bytes=row["size_bytes"],
        char_count=row["char_count"],
        chunk_count=row["chunk_count"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _assert_space(db, space_id: uuid.UUID) -> None:
    exists = await db.fetchval("select 1 from public.spaces where id = $1", space_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Space not found.")


async def _check_quota(user_id: str) -> None:
    """413 when the intake service says the storage quota is full."""
    try:
        await check_quota(user_id)
    except QuotaReached as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc


async def _upload(
    *, token: str, user_id: str, space_id: uuid.UUID, source_id: uuid.UUID, filename: str, data: bytes
) -> str:
    """502 when storage rejects the write or cannot be reached."""
    try:
        return await upload_to_storage(
            token=token, user_id=user_id, space_id=space_id, source_id=source_id, filename=filename, data=data
        )
    except StorageUploadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("", response_model=list[SourceOut])
async def list_sources(space_id: uuid.UUID, db: DbDep) -> list[SourceOut]:
    await _assert_space(db, space_id)
    rows = await db.fetch(
        _SOURCE_SELECT + " where s.space_id = $1 and s.user_id = auth.uid() order by s.created_at desc",
        space_id,
    )
    return [_to_out(r) for r in rows]


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_source(
    request: Request,
    space_id: uuid.UUID,
    db: DbDep,
    file: Annotated[UploadFile, File()],
) -> UploadResponse:
    settings = get_settings()
    user = request.state.verified_user
    rl = await rate_limit(f"upload:{user.id}", settings.rate_limit_upload_per_5min, 300)
    if not rl.allowed:
        raise HTTPException(status_code=429, detail="Upload limit reached. Try again in a few minutes.")

    await _assert_space(db, space_id)
    await _check_quota(user.id)

    original = sanitize_filename(file.filename or "upload")
    ext = "." + original.rsplit(".", 1)[-1].lower() if "." in original else ""
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    try:
        safe_name = validate_upload(original, file.content_type, len(data))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File is larger than the {settings.max_upload_mb} MB limit.")

    file_type = _TYPE_BY_EXT.get(ext, "text")
    source_id = uuid.uuid4()
    token = request.headers.get("authorization", "").split(" ", 1)[-1]

    storage_path = await _upload(
        token=token, user_id=user.id, space_id=space_id, source_id=source_id, filename=safe_name, data=data
    )

    row_id = await create_source(
        db, user_id=user.id, space_id=space_id, file_type=file_type,
        title=safe_name, storage_path=storage_path, size_bytes=len(data),
    )
    try:
        await enqueue_ingest(
            source_id=row_id, user_id=user.id, space_id=space_id,
            storage_path=storage_path, file_type=file_type, title=safe_name,
        )
    except Exception as exc:
        # No point marking the row 'failed' here: the 503 rolls back the
        # request's whole transaction (deps.user_conn), the insert included.
        raise HTTPException(status_code=503, detail="Job queue unavailable. Please retry shortly.") from exc

    row = await db.fetchrow(_SOURCE_SELECT + " where s.id = $1", row_id)
    return UploadResponse(source=_to_out(row))


@router.post("/pasted", response_model=UploadResponse, status_code=201)
async def add_pasted_text(
    request: Request, space_id: uuid.UUID, db: DbDep, body: PastedTextInput
) -> UploadResponse:
    settings = get_settings()
    user = request.state.verified_user
    rl = await rate_limit(f"upload:{user.id}", settings.rate_limit_upload_per_5min, 300)
    if not rl.allowed:
        raise HTTPException(status_code=429, detail="Upload limit reached. Try again in a few minutes.")

    await _assert_space(db, space_id)
    await _check_quota(user.id)

    data = body.content.encode("utf-8")
    filename = sanitize_filename(body.title + (".md" if body.markdown else ".txt"))
    source_id = uuid.uuid4()
    token = request.headers.get("authorization", "").split(" ", 1)[-1]
    storage_path = await _upload(
        token=token, user_id=user.id, space_id=space_id, source_id=source_id, filename=filename, data=data
    )
    row_id = await create_source(
        db, user_id=user.id, space_id=space_id,
        file_type="markdown" if body.markdown else "text",
        title=body.title, storage_path=storage_path, size_bytes=len(data),
    )
    try:
        await enqueue_ingest(
            source_id=row_id, user_id=user.id, space_id=space_id,
            storage_path=storage_path,
            file_type="markdown" if body.markdown else "text",
            title=body.title,
            pasted_text=body.content,
        )
    except Exception as exc:
        # As in upload_source: the 503 rolls the insert back, so there is no
        # row left to mark 'failed'.
        raise HTTPException(status_code=503, detail="Job queue unavailable. Please retry shortly.") from exc

    row = await db.fetchrow(_SOURCE_SELECT + " where s.id = $1", row_id)
    return UploadResponse(source=_to_out(row))


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    request: Request, space_id: uuid.UUID, source_id: uuid.UUID, db: DbDep
) -> None:
    row = await db.fetchrow(
        "select id, storage_path from public.sources where id = $1 and space_id = $2 and user_id = auth.uid()",
        source_id, space_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Source not found.")
    await db.execute("delete from public.sources where id = $1", source_id)

    if row["storage_path"]:
        token = request.headers.get("authorization", "").split(" ", 1)[-1]
        try:
            await delete_from_storage(token=token, path=row["storage_path"])
        except StorageDeleteError:
            pass  # the row is gone; this object now belongs to no row

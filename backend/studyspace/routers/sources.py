"""Source uploads: file → Supabase Storage → ARQ ingestion job.

Validation (type/size/filename/quota) happens here, server-side, before
anything reaches storage. Storage objects live under the user's own folder so
RLS on ``storage.objects`` allows only the owner to read them; temporary
access uses signed URLs.
"""

from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from studyspace.config import get_settings
from studyspace.deps import DbDep, UserDep
from studyspace.models.sources import PastedTextInput, SourceOut, UploadResponse
from studyspace.queue import enqueue_ingest
from studyspace.rate_limit import quota_used_bytes, rate_limit
from studyspace.security import sanitize_filename, validate_upload

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
    settings = get_settings()
    used = await quota_used_bytes(user_id)
    if used >= settings.storage_quota_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"Storage quota reached ({settings.storage_quota_mb} MB). Delete a source to free space.",
        )


async def _upload_to_storage(
    *, token: str, user_id: str, space_id: uuid.UUID, source_id: uuid.UUID, filename: str, data: bytes
) -> str:
    """Upload bytes to the private `sources` bucket **as the user** (their JWT
    authorises the write through storage RLS)."""
    settings = get_settings()
    path = f"{user_id}/{space_id}/{source_id}/{filename}"
    url = f"{settings.storage_base}/object/sources/{path}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            url,
            content=data,
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
                "x-upsert": "true",
                "Content-Type": "application/octet-stream",
            },
        )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Storage upload failed ({resp.status_code}). Check SUPABASE_URL and that the `sources` bucket exists.",
        )
    return path


async def _create_source(
    db,
    *,
    user_id: str,
    space_id: uuid.UUID,
    file_type: str,
    title: str,
    storage_path: str | None,
    size_bytes: int,
) -> uuid.UUID:
    return await db.fetchval(
        "insert into public.sources (user_id, space_id, type, title, storage_path, size_bytes, status) "
        "values ($1, $2, $3, $4, $5, $6, 'queued') returning id",
        user_id, space_id, file_type, title[:200], storage_path, size_bytes,
    )


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
    file: UploadFile = File(...),
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

    try:
        storage_path = await _upload_to_storage(
            token=token, user_id=user.id, space_id=space_id, source_id=source_id, filename=safe_name, data=data
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Storage upload failed. Please retry.") from exc

    row_id = await _create_source(
        db, user_id=user.id, space_id=space_id, file_type=file_type,
        title=safe_name, storage_path=storage_path, size_bytes=len(data),
    )
    try:
        await enqueue_ingest(
            source_id=row_id, user_id=user.id, space_id=space_id,
            storage_path=storage_path, file_type=file_type, title=safe_name,
        )
    except Exception:
        await db.execute(
            "update public.sources set status = 'failed', error = $2 where id = $1",
            row_id,
            "Background queue unavailable — start Redis (docker compose up -d redis) and retry.",
        )
        raise HTTPException(status_code=503, detail="Job queue unavailable. Please retry shortly.")

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
    storage_path = await _upload_to_storage(
        token=token, user_id=user.id, space_id=space_id, source_id=source_id, filename=filename, data=data
    )
    row_id = await _create_source(
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
    except Exception:
        await db.execute(
            "update public.sources set status = 'failed', error = $2 where id = $1",
            row_id,
            "Background queue unavailable — start Redis (docker compose up -d redis) and retry.",
        )
        raise HTTPException(status_code=503, detail="Job queue unavailable. Please retry shortly.")

    row = await db.fetchrow(_SOURCE_SELECT + " where s.id = $1", row_id)
    return UploadResponse(source=_to_out(row))


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    request: Request, space_id: uuid.UUID, source_id: uuid.UUID, db: DbDep
) -> None:
    user = request.state.verified_user
    row = await db.fetchrow(
        "select id, storage_path from public.sources where id = $1 and space_id = $2 and user_id = auth.uid()",
        source_id, space_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Source not found.")
    await db.execute("delete from public.sources where id = $1", source_id)

    if row["storage_path"]:
        settings = get_settings()
        token = request.headers.get("authorization", "").split(" ", 1)[-1]
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                await client.delete(
                    f"{settings.storage_base}/object/sources/{row['storage_path']}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "apikey": settings.supabase_anon_key,
                    },
                )
        except httpx.HTTPError:
            pass  # row is gone; orphaned object is cleaned up by lifecycle rules

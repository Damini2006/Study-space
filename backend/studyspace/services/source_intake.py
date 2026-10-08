"""Where bytes become sources: storage upload, source rows, quota.

Shared by the upload/pasted endpoints (``routers/sources.py``) and the bundle
import (``routers/export.py``) so every path into the sources table builds the
same storage layout and enforces the same limits — a source is a source
whether it arrived one file at a time or fifty from an archive.

The service layer raises its own exceptions with user-facing messages;
routers translate them to HTTP status codes, because transport concerns do
not belong down here.
"""

from __future__ import annotations

import uuid

import httpx

from studyspace.config import get_settings
from studyspace.rate_limit import quota_used_bytes


class IntakeError(Exception):
    """Base class for intake failures; the message is user-facing."""


class QuotaReached(IntakeError):
    """The user's stored bytes are at the configured cap."""


class StorageUploadError(IntakeError):
    """Storage rejected the write or could not be reached."""


async def check_quota(user_id: str) -> None:
    """Raise :class:`QuotaReached` when the user has no space left."""
    settings = get_settings()
    used = await quota_used_bytes(user_id)
    if used >= settings.storage_quota_mb * 1024 * 1024:
        raise QuotaReached(
            f"Storage quota reached ({settings.storage_quota_mb} MB). Delete a source to free space."
        )


async def upload_to_storage(
    *, token: str, user_id: str, space_id: uuid.UUID, source_id: uuid.UUID, filename: str, data: bytes
) -> str:
    """Upload bytes to the private `sources` bucket **as the user** (their JWT
    authorises the write through storage RLS). Returns the storage path."""
    settings = get_settings()
    path = f"{user_id}/{space_id}/{source_id}/{filename}"
    url = f"{settings.storage_base}/object/sources/{path}"
    try:
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
    except httpx.HTTPError as exc:
        raise StorageUploadError("Storage upload failed. Please retry.") from exc
    if resp.status_code >= 400:
        raise StorageUploadError(
            f"Storage upload failed ({resp.status_code}). Check SUPABASE_URL and that the `sources` bucket exists."
        )
    return path


async def create_source(
    db,
    *,
    user_id: str,
    space_id: uuid.UUID,
    file_type: str,
    title: str,
    storage_path: str | None,
    size_bytes: int,
) -> uuid.UUID:
    """Insert a ``queued`` source row; title is clamped to the column cap."""
    return await db.fetchval(
        "insert into public.sources (user_id, space_id, type, title, storage_path, size_bytes, status) "
        "values ($1, $2, $3, $4, $5, $6, 'queued') returning id",
        user_id, space_id, file_type, title[:200], storage_path, size_bytes,
    )

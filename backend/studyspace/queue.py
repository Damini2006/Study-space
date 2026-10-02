"""ARQ job enqueueing (API side). Job *execution* lives in the worker."""

from __future__ import annotations

import uuid
from typing import Any

from arq import create_pool
from arq.connections import RedisSettings

from studyspace.config import get_settings

_pool: Any = None


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


async def get_queue() -> Any:
    global _pool
    if _pool is None:
        _pool = await create_pool(_redis_settings())
    return _pool


async def close_queue() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


async def enqueue_ingest(
    *,
    source_id: uuid.UUID | str,
    user_id: str,
    space_id: uuid.UUID | str,
    storage_path: str | None,
    file_type: str,
    title: str,
    pasted_text: str | None = None,
) -> None:
    """Queue the ingestion job; raises when Redis is unreachable so the caller
    can mark the source failed with a readable error."""
    queue = await get_queue()
    await queue.enqueue_job(
        "ingest_source",
        str(source_id),
        str(user_id),
        str(space_id),
        storage_path,
        file_type,
        title,
        pasted_text,
        _job_id=f"ingest:{source_id}",
        _job_timeout=600,
    )


__all__ = ["close_queue", "enqueue_ingest", "get_queue"]

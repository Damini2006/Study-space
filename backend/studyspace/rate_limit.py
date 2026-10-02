"""Redis-backed rate limiting (fixed windows per identity + route)."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import redis.asyncio as aioredis

from studyspace.config import get_settings

_redis: aioredis.Redis | None = None
_disabled = False


def set_redis(client: aioredis.Redis | None) -> None:
    """Test hook — inject a (fakeredis) client or reset to the real one."""
    global _redis, _disabled
    _redis = client
    _disabled = False


async def get_redis() -> aioredis.Redis | None:
    global _redis, _disabled
    if _redis is not None:
        return _redis
    if _disabled:
        return None
    try:
        client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
        await client.ping()
        _redis = client
        return _redis
    except Exception:  # pragma: no cover - depends on environment
        # Fail open: a Redis outage must not take the API down. Rate limiting
        # is a safety net, not an authorization control (RLS is).
        _disabled = True
        return None


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after: int


async def rate_limit(key: str, limit: int, window_seconds: int) -> RateLimitResult:
    """Increment a fixed-window counter for ``key``; return whether it passed."""
    client = await get_redis()
    if client is None or limit <= 0:
        return RateLimitResult(allowed=True, remaining=limit, retry_after=0)
    bucket = int(time.time()) // window_seconds
    redis_key = f"rl:{key}:{bucket}"
    try:
        pipe = client.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, window_seconds + 1)
        count, _ = await pipe.execute()
        count = int(count)
    except Exception:  # pragma: no cover - network failures
        return RateLimitResult(allowed=True, remaining=limit, retry_after=0)

    remaining = max(0, limit - count)
    if count > limit:
        retry = window_seconds - (int(time.time()) % window_seconds)
        return RateLimitResult(allowed=False, remaining=0, retry_after=retry)
    return RateLimitResult(allowed=True, remaining=remaining, retry_after=0)


async def quota_used_bytes(user_id: str) -> int:
    """Sum of stored source sizes for a user (used by the upload quota check)."""
    from studyspace.db import fetch_one, init_pool, user_conn  # local import: no cycle

    claims = {"sub": user_id, "role": "authenticated"}
    await init_pool()
    async with user_conn(claims) as conn:
        row = await fetch_one(conn, "select coalesce(sum(size_bytes), 0)::bigint as total from public.sources")
    return int(row["total"]) if row else 0


__all__ = ["RateLimitResult", "get_redis", "quota_used_bytes", "rate_limit", "set_redis"]

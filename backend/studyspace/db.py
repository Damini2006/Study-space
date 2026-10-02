"""Postgres access.

Two clearly separated paths:

1. **User-scoped connections** (:func:`user_conn`) — every request handler uses
   these. The connection assumes an unprivileged role and injects the *verified*
   JWT claims, so Postgres evaluates Row Level Security with ``auth.uid()``
   exactly as it would through Supabase's API. No query in this project can
   read another user's rows unless it goes through this path.

2. **Service connections** — live in :mod:`studyspace.db_service` and are
   imported only by the ingestion worker / admin scripts, never by routers
   (enforced by ``backend/tests/test_security.py``).
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import asyncpg

from studyspace.config import get_settings

_pool: asyncpg.Pool | None = None


def _claims_json(claims: dict[str, Any]) -> str:
    return json.dumps(claims, separators=(",", ":"))


async def init_pool() -> asyncpg.Pool:
    """Create the shared connection pool (called once at startup)."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            command_timeout=60,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialised — call init_pool() first.")
    return _pool


def set_pool(pool: asyncpg.Pool | None) -> None:
    """Test hook: install a pre-built pool (or None to reset)."""
    global _pool
    _pool = pool


@asynccontextmanager
async def user_conn(claims: dict[str, Any]) -> AsyncIterator[asyncpg.Connection]:
    """Yield a connection that behaves like *this user* to Postgres.

    Inside the transaction we ``SET LOCAL`` both the JWT claims (so
    ``auth.uid()`` returns the user's uuid) and the unprivileged role, which
    forces Row Level Security on for every query that follows.
    """
    settings = get_settings()
    pool = await init_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("select set_config('request.jwt.claims', $1, true)", _claims_json(claims))
            # Role switch must be last: it drops the privileges used to set
            # the config above would still work, but keep ordering explicit.
            await conn.execute(f"set local role {settings.db_user_role}")
            yield conn


async def fetch_all(conn: asyncpg.Connection, sql: str, *args: Any) -> list[dict[str, Any]]:
    return [dict(r) for r in await conn.fetch(sql, *args)]


async def fetch_one(conn: asyncpg.Connection, sql: str, *args: Any) -> dict[str, Any] | None:
    row = await conn.fetchrow(sql, *args)
    return dict(row) if row else None


def jsonify(value: Any) -> Any:
    """Make jsonb/array columns JSON-serialisable for API responses."""
    if isinstance(value, (dict, list)):
        return value
    return value

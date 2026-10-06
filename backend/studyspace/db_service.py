"""Service (owner) Postgres access — **worker and admin scripts only**.

This module bypasses RLS because it connects as the table owner. It must never
be imported from ``studyspace.routers`` (verified by an import-boundary test)
and the Supabase *service-role key* must never appear in request handlers or
frontend code. The ingestion worker and evaluation runner use it to write
chunks and results on behalf of users whose rows they own.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg

from studyspace.config import get_settings


@asynccontextmanager
async def service_conn() -> AsyncIterator[asyncpg.Connection]:
    settings = get_settings()
    conn = await asyncpg.connect(dsn=settings.database_url, command_timeout=120)
    try:
        async with conn.transaction():
            yield conn
    finally:
        await conn.close()

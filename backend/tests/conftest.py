"""Shared pytest fixtures.

Two modes:
- unit tests (no env needed) — chunking, RRF, security helpers, FSRS wiring
- integration tests require TEST_DATABASE_URL (a pgvector Postgres) or the
  docker container from `docker-compose -f docker-compose.test.yml up -d`.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:54329/studyspace_test"),
)

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql"))
SHIM = (REPO_ROOT / "supabase" / "tests" / "shim.sql").read_text(encoding="utf-8")


@pytest.fixture(autouse=True)
def _reset_settings_cache(monkeypatch):
    for var, value in {
        "SUPABASE_JWT_SECRET": "test-secret-that-is-long-enough-for-hs256-000",
        "SUPABASE_URL": "http://localhost:54321",
        "DATABASE_URL": TEST_DB_URL,
        "DB_USER_ROLE": "authenticated",
        "LITELLM_MODEL": "gpt-4o-mini",
        "LITELLM_JUDGE_MODEL": "gpt-4o-mini",
        "EMBEDDING_MODEL": "text-embedding-3-small",
        "RERANKER": "lexical",
        "LANGFUSE_ENABLED": "false",
        "DEMO_ENABLED": "true",
        "CORS_ORIGINS": "http://localhost:5173",
    }.items():
        monkeypatch.setenv(var, value)
    from studyspace.config import get_settings

    get_settings.cache_clear()
    # each test runs in its own event loop; DB pools are per-loop, so drop them
    try:
        from studyspace.db import set_pool
        from studyspace.rate_limit import set_redis

        set_pool(None)
        set_redis(None)
    except Exception:
        pass
    yield
    get_settings.cache_clear()
    try:
        from studyspace.db import set_pool

        set_pool(None)
    except Exception:
        pass


def _asyncpg():
    import asyncpg

    return asyncpg


async def _apply_migrations(db_url: str) -> None:
    """Drop the public schema and apply shim + every migration."""
    asyncpg = _asyncpg()
    conn = await asyncpg.connect(dsn=db_url, command_timeout=60)
    try:
        await conn.execute("drop schema if exists public cascade; create schema public;")
        await conn.execute("drop table if exists auth.users cascade; drop schema if exists auth cascade;")
        await conn.execute("drop schema if exists storage cascade;")
        await conn.execute(SHIM)
        for path in MIGRATIONS:
            await conn.execute(path.read_text(encoding="utf-8"))
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def db_url() -> str:
    return TEST_DB_URL


@pytest.fixture()
async def migrated_db(db_url):
    """Yield a fresh, fully-migrated test database (per test for isolation)."""
    await _apply_migrations(db_url)
    return db_url


@pytest.fixture()
async def two_users(migrated_db):
    asyncpg = _asyncpg()
    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        await conn.execute(
            "insert into auth.users (id, email) values "
            "('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.dev'), "
            "('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@test.dev')"
        )
        rows = await conn.fetch("select user_id from public.profiles order by user_id")
        assert len(rows) == 2  # trigger created profiles
    finally:
        await conn.close()
    return {
        "alice": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "bob": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    }


def make_token(user_id: str, email: str, secret: str = "test-secret-that-is-long-enough-for-hs256-000") -> str:
    from joserfc import jwt, jwk

    now = int(time.time())
    claims = {
        "sub": user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "email": email,
        "exp": now + 3600,
        "iat": now,
        "iss": "http://localhost:54321/auth/v1",
    }
    return jwt.encode({"alg": "HS256", "typ": "JWT"}, claims, jwk.import_key(secret.encode(), "oct"))


@pytest.fixture()
def api_client(monkeypatch):
    """HTTP client wired to the app with auth + claims flowing into user_conn."""
    from httpx import ASGITransport, AsyncClient

    from studyspace.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def headers_for(user_id: str, email: str) -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email)}"}

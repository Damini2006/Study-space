"""RLS policy tests: prove user A cannot touch user B's rows, exercising the
same claims-injection path the API uses in production (`user_conn`)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio

ALICE = {"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}
BOB = {"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}


def _claims(user_id: str) -> dict:
    return {"sub": user_id, "role": "authenticated"}


async def _alice(conn_factory):
    return conn_factory(ALICE)


async def test_every_table_has_rls(migrated_db):
    """RLS must be enabled on *every* table that holds user data."""
    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        rows = await conn.fetch(
            "select tablename from pg_tables where schemaname = 'public' "
            "and tablename not like 'pg_%' and rowsecurity = false"
        )
        # no public table may be missing RLS
        assert rows == []
    finally:
        await conn.close()


async def test_spaces_invisible_to_other_users(migrated_db, two_users):
    from studyspace.db import set_pool, user_conn
    import asyncpg

    settings_pool = await asyncpg.create_pool(dsn=migrated_db, min_size=1, max_size=4)
    set_pool(settings_pool)
    try:
        async with user_conn(_claims(two_users["alice"])) as conn:
            await conn.fetchval(
                "insert into public.spaces (title) values ('Alice only') returning id"
            )
        async with user_conn(_claims(two_users["bob"])) as conn:
            count = await conn.fetchval("select count(*) from public.spaces")
            assert count == 0, "bob must never see alice's spaces"
        async with user_conn(_claims(two_users["alice"])) as conn:
            count = await conn.fetchval("select count(*) from public.spaces")
            assert count == 1
            title = await conn.fetchval("select title from public.spaces")
            assert title == "Alice only"
    finally:
        await settings_pool.close()
        set_pool(None)


async def test_insert_as_other_user_blocked(migrated_db, two_users):
    from studyspace.db import set_pool, user_conn
    import asyncpg

    pool = await asyncpg.create_pool(dsn=migrated_db, min_size=1, max_size=4)
    set_pool(pool)
    try:
        async with user_conn(_claims(two_users["alice"])) as conn:
            await conn.fetchval(
                "insert into public.spaces (title) values ('Alice space') returning id"
            )
        with pytest.raises(Exception) as excinfo:
            async with user_conn(_claims(two_users["bob"])) as conn:
                # an explicit user_id of alice must be rejected by the
                # WITH CHECK clause
                await conn.execute(
                    "insert into public.spaces (title, user_id) values ('hijack', $1)",
                    two_users["alice"],
                )
        assert "row-level security" in str(excinfo.value) or "not-null" in str(excinfo.value)
        # and bob cannot read or update alice's rows at all
        async with user_conn(_claims(two_users["bob"])) as conn:
            updated = await conn.execute(
                "update public.spaces set title = 'pwned' where user_id = $1", two_users["alice"]
            )
            assert updated == "UPDATE 0"
            deleted = await conn.execute(
                "delete from public.spaces where user_id = $1", two_users["alice"]
            )
            assert deleted == "DELETE 0"
    finally:
        await pool.close()
        set_pool(None)


async def test_chunks_and_sources_follow_rls(migrated_db, two_users):
    from studyspace.db import set_pool, user_conn
    import asyncpg

    pool = await asyncpg.create_pool(dsn=migrated_db, min_size=1, max_size=4)
    set_pool(pool)
    try:
        async with user_conn(_claims(two_users["alice"])) as conn:
            space_id = await conn.fetchval(
                "insert into public.spaces (title) values ('Alice') returning id"
            )
            source_id = await conn.fetchval(
                "insert into public.sources (space_id, type, title) values ($1, 'text', 's1') returning id",
                space_id,
            )
            await conn.execute(
                "insert into public.chunks (source_id, space_id, content, position) "
                "values ($1, $2, $3, 0)",
                source_id,
                space_id,
                "Every action is under your control.",
            )
        async with user_conn(_claims(two_users["bob"])) as conn:
            n = await conn.fetchval("select count(*) from public.chunks")
            assert n == 0
            s = await conn.fetchval("select count(*) from public.sources")
            assert s == 0
        async with user_conn(_claims(two_users["alice"])) as conn:
            rows = await conn.fetch(
                "select tsv @@ plainto_tsquery('english', 'control') as hit from public.chunks"
            )
            assert rows[0]["hit"] is True
    finally:
        await pool.close()
        set_pool(None)


async def test_chat_and_study_tables_respect_rls(migrated_db, two_users):
    import asyncpg
    from studyspace.db import set_pool, user_conn

    pool = await asyncpg.create_pool(dsn=migrated_db, min_size=1, max_size=4)
    set_pool(pool)
    try:
        async with user_conn(_claims(two_users["alice"])) as conn:
            space_id = await conn.fetchval(
                "insert into public.spaces (title) values ('Alice') returning id"
            )
            thread = await conn.fetchval(
                "insert into public.chat_threads (space_id) values ($1) returning id", space_id
            )
            await conn.execute(
                "insert into public.messages (thread_id, space_id, role, content) values ($1, $2, 'user', 'hi')",
                thread, space_id,
            )
            card = await conn.fetchval(
                "insert into public.cards (space_id, front, back) values ($1, 'q', 'a') returning id",
                space_id,
            )
            await conn.execute(
                "insert into public.card_state (user_id, card_id, due) values ($1, $2, now())",
                two_users["alice"], card,
            )
        async with user_conn(_claims(two_users["bob"])) as conn:
            assert await conn.fetchval("select count(*) from public.chat_threads") == 0
            assert await conn.fetchval("select count(*) from public.messages") == 0
            assert await conn.fetchval("select count(*) from public.cards") == 0
            assert await conn.fetchval("select count(*) from public.card_state") == 0
    finally:
        await pool.close()
        set_pool(None)

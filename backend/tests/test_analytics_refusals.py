"""Per-space refusal rates on /analytics/summary.

The Landing page promises "if the corpus does not contain it, the model
says so" — messages.status has always carried that verdict, yet nothing
in the product ever showed it. These pin the new field: per space, how
many verdict-carrying answers exist and how many were refusals, isolated
to the caller's own messages, and empty until someone has actually
chatted inside a Space.
"""

from __future__ import annotations

from pathlib import Path

import asyncpg
from conftest import headers_for

ALICE = {"email": "alice@test.dev"}
BOB = {"email": "bob@test.dev"}


async def _seed(dsn: str, users: dict[str, str]) -> None:
    conn = await asyncpg.connect(dsn=dsn)
    try:
        alice_space = await conn.fetchval(
            "insert into public.spaces (user_id, title) values ($1, 'Biology') returning id",
            users["alice"],
        )
        alice_thread = await conn.fetchval(
            "insert into public.chat_threads (user_id, space_id) values ($1, $2) returning id",
            users["alice"],
            alice_space,
        )
        # Alice: a question (no verdict), three verdicts (one refusal) and a
        # legacy assistant row from before statuses existed.
        await conn.execute(
            "insert into public.messages (user_id, thread_id, space_id, role, content, status) values "
            "($1, $2, $3, 'user', 'what is osmosis?', null), "
            "($1, $2, $3, 'assistant', 'Water moving across a membrane.', 'verified'), "
            "($1, $2, $3, 'assistant', 'Partly supported.', 'low_confidence'), "
            "($1, $2, $3, 'assistant', 'No source covers that.', 'not_found'), "
            "($1, $2, $3, 'assistant', 'written before statuses existed', null)",
            users["alice"],
            alice_thread,
            alice_space,
        )
        bob_space = await conn.fetchval(
            "insert into public.spaces (user_id, title) values ($1, 'Chemistry') returning id",
            users["bob"],
        )
        bob_thread = await conn.fetchval(
            "insert into public.chat_threads (user_id, space_id) values ($1, $2) returning id",
            users["bob"],
            bob_space,
        )
        await conn.execute(
            "insert into public.messages (user_id, thread_id, space_id, role, content, status) values "
            "($1, $2, $3, 'assistant', 'a', 'not_found'), "
            "($1, $2, $3, 'assistant', 'b', 'not_found'), "
            "($1, $2, $3, 'assistant', 'c', 'verified')",
            users["bob"],
            bob_thread,
            bob_space,
        )
    finally:
        await conn.close()


async def test_summary_counts_answers_and_refusals_per_space(api_client, migrated_db, two_users):
    await _seed(migrated_db, two_users)
    h = headers_for(two_users["alice"], ALICE["email"])

    r = await api_client.get("/api/analytics/summary", headers=h)
    assert r.status_code == 200, r.text

    # asked = the three verdict-carrying replies (the user's question and the
    # status-less legacy row carry no verdict and cannot be answered-or-refused);
    # refused = the single not_found.
    assert r.json()["per_space_refusals"] == [
        {"space": "Biology", "asked": 3, "refused": 1}
    ]


async def test_refusal_rates_never_cross_into_another_users_chats(api_client, migrated_db, two_users):
    await _seed(migrated_db, two_users)

    alice = await api_client.get(
        "/api/analytics/summary", headers=headers_for(two_users["alice"], ALICE["email"])
    )
    assert alice.status_code == 200, alice.text
    assert {row["space"] for row in alice.json()["per_space_refusals"]} == {"Biology"}

    bob = await api_client.get(
        "/api/analytics/summary", headers=headers_for(two_users["bob"], BOB["email"])
    )
    assert bob.status_code == 200, bob.text
    assert bob.json()["per_space_refusals"] == [
        {"space": "Chemistry", "asked": 3, "refused": 2}
    ]


async def test_no_chats_yet_means_no_refusal_rows(api_client, migrated_db, two_users):
    r = await api_client.get(
        "/api/analytics/summary", headers=headers_for(two_users["alice"], ALICE["email"])
    )
    assert r.status_code == 200, r.text
    assert r.json()["per_space_refusals"] == []


def test_the_refusal_query_states_its_callers_scope_in_sql():
    """messages already carries an RLS policy, but every query in this
    router states `user_id = auth.uid()` itself; the isolation the tests
    above observe is meant to hold in the SQL too, not only in RLS."""
    router = (
        Path(__file__).resolve().parents[1] / "studyspace" / "routers" / "analytics.py"
    ).read_text(encoding="utf-8")
    assert "where m.user_id = auth.uid() and m.status is not null" in router

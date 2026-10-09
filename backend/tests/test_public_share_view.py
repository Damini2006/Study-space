"""Published pages and invite links resolve for the people holding them.

Both link-resolving routes sat behind the ordinary auth dependency, so the
endpoints whose own comments promised "no auth required" answered 401 to
the one visitor they exist for — and no frontend route called them at
all. These tests pin the contract from the link-holder's side: no bearer
token in, full read-only content out; a credential that has been
withdrawn (slug unpublished, token revoked or expired) reads nothing; and
the content builder, which takes a raw space id, is unreachable on its
own.
"""

from __future__ import annotations

import pytest
from conftest import headers_for

CARD_FRONT = "What is ATP?"
CARD_BACK = "The energy currency of the cell."
NOTE_TEXT = "Light reactions make ATP and NADPH."


async def _create_space(api_client, h: dict, title: str = "Biology") -> str:
    resp = await api_client.post("/api/spaces", json={"title": title}, headers=h)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _seed(db_url: str, user_id: str, space_id: str) -> None:
    """One source, one card, one note — every section a link must show.

    Only the worker can make a source 'ready', so this goes in through
    SQL the way the worker's own writes would look.
    """
    import asyncpg

    conn = await asyncpg.connect(dsn=db_url)
    try:
        await conn.execute(
            "insert into public.sources (user_id, space_id, type, title, status, char_count) "
            "values ($1, $2, 'markdown', 'Lecture 1', 'ready', 4096)",
            user_id,
            space_id,
        )
        await conn.execute(
            "insert into public.cards (user_id, space_id, front, back, tags) "
            "values ($1, $2, $3, $4, array['bio'])",
            user_id,
            space_id,
            CARD_FRONT,
            CARD_BACK,
        )
        await conn.execute(
            "insert into public.notes (user_id, space_id, title, content_text) "
            "values ($1, $2, 'Photosynthesis', $3)",
            user_id,
            space_id,
            NOTE_TEXT,
        )
    finally:
        await conn.close()


async def _publish(api_client, h: dict, space_id: str, slug: str) -> None:
    resp = await api_client.post(
        f"/api/spaces/{space_id}/public", json={"slug": slug}, headers=h
    )
    assert resp.status_code == 201, resp.text


async def test_an_anonymous_visitor_reads_a_published_space_in_full(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h, title="Biology")
    await _seed(migrated_db, two_users["alice"], space_id)
    # A second space that is never published must not ride along.
    private = await _create_space(api_client, h, title="Do Not Leak")
    await _seed(migrated_db, two_users["alice"], private)
    await _publish(api_client, h, space_id, "bio-notes")

    # No Authorization header at all — this is the link-holder's request.
    resp = await api_client.get("/api/spaces/public/bio-notes")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["space"]["title"] == "Biology"
    assert body["space"]["source_count"] == 1
    assert body["space"]["card_count"] == 1
    assert body["space"]["note_count"] == 1
    assert body["sources"][0]["title"] == "Lecture 1"
    assert body["sources"][0]["status"] == "ready"
    assert body["cards"][0]["front"] == CARD_FRONT
    assert body["cards"][0]["back"] == CARD_BACK
    assert body["cards"][0]["tags"] == ["bio"]
    assert body["notes"][0]["content_text"] == NOTE_TEXT
    # Owner-only state stays home: the viewer's screen has no due counts.
    assert "due_today" not in body["space"]
    # Only the published space's content comes back.
    assert "Do Not Leak" not in resp.text


async def test_an_unpublished_slug_stops_reading_immediately(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    await _seed(migrated_db, two_users["alice"], space_id)
    await _publish(api_client, h, space_id, "temp-slug")

    live = await api_client.get("/api/spaces/public/temp-slug")
    assert live.status_code == 200, live.text

    unpub = await api_client.delete(f"/api/spaces/{space_id}/public", headers=h)
    assert unpub.status_code == 204, unpub.text

    gone = await api_client.get("/api/spaces/public/temp-slug")
    assert gone.status_code == 404, gone.text
    never = await api_client.get("/api/spaces/public/never-existed")
    assert never.status_code == 404, never.text


async def test_an_invite_link_reads_the_space_until_it_is_revoked(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    await _seed(migrated_db, two_users["alice"], space_id)

    created = await api_client.post(
        f"/api/spaces/{space_id}/shares", json={"expires_in_days": 7}, headers=h
    )
    assert created.status_code == 201, created.text
    token = created.json()["token"]

    resp = await api_client.get(f"/api/spaces/shared/{token}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["cards"][0]["front"] == CARD_FRONT

    shares = await api_client.get(f"/api/spaces/{space_id}/shares", headers=h)
    revoked = await api_client.delete(
        f"/api/spaces/{space_id}/shares/{shares.json()[0]['id']}", headers=h
    )
    assert revoked.status_code in (200, 204), revoked.text

    gone = await api_client.get(f"/api/spaces/shared/{token}")
    assert gone.status_code == 404, gone.text


async def test_an_expired_invite_link_reads_nothing(
    api_client, migrated_db, two_users
):
    import asyncpg

    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    await _seed(migrated_db, two_users["alice"], space_id)

    created = await api_client.post(
        f"/api/spaces/{space_id}/shares", json={"expires_in_days": 7}, headers=h
    )
    assert created.status_code == 201, created.text
    token = created.json()["token"]

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        await conn.execute(
            "update public.space_shares set expires_at = now() - interval '1 hour' "
            "where token = $1",
            token,
        )
    finally:
        await conn.close()

    gone = await api_client.get(f"/api/spaces/shared/{token}")
    assert gone.status_code == 404, gone.text


async def test_a_long_deck_is_capped_and_the_total_stays_true(
    api_client, migrated_db, two_users
):
    """The page may show the first 500 cards, but it must never claim the
    deck only has 500 — the count next to the list stays the real one."""
    import asyncpg

    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        await conn.execute(
            "insert into public.cards (user_id, space_id, front, back) "
            "select $1, $2, 'Card ' || g, 'Answer ' || g "
            "from generate_series(1, 501) g",
            two_users["alice"],
            space_id,
        )
    finally:
        await conn.close()

    await _publish(api_client, h, space_id, "big-deck")
    resp = await api_client.get("/api/spaces/public/big-deck")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["cards"]) == 500
    assert body["space"]["card_count"] == 501


async def test_the_viewer_sees_the_same_page_signed_in_or_not(
    api_client, migrated_db, two_users
):
    """A link's view is a property of the link, not of whoever opens it."""
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    await _seed(migrated_db, two_users["alice"], space_id)
    await _publish(api_client, h, space_id, "same-view")

    anonymous = await api_client.get("/api/spaces/public/same-view")
    signed_in = await api_client.get(
        "/api/spaces/public/same-view", headers=h
    )
    assert anonymous.status_code == 200, anonymous.text
    assert signed_in.status_code == 200, signed_in.text
    assert signed_in.json() == anonymous.json()


async def test_the_content_builder_is_not_callable_on_its_own(migrated_db):
    """`_space_view` takes a raw space id, so its EXECUTE privilege is
    revoked from PUBLIC: the credential functions are the only way in,
    and no caller can hand this one a borrowed id."""
    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        await conn.execute("set role authenticated")
        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError):
            await conn.fetchval(
                "select public._space_view($1)",
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            )
    finally:
        await conn.close()

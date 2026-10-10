"""MCP personal access tokens are real credentials, honestly limited.

The Settings panel promises revocable, scope-limited tokens "for MCP
clients to access your study data". These tests pin the promise's parts
where the API enforces them:

* a token acts as *its owner* with Row Level Security applied — same
  blast radius as a session, never wider;
* scopes gate the HTTP method — a read token cannot write, a write
  token cannot read (the independent checkboxes in the UI mean what
  they say);
* revocation bites on the very next request;
* no token can ever reach admin: claims carry no email, so ``is_admin``
  stays dark while the same human's session JWT lights it up;
* a live token records when it was last used (throttled to one write
  per five minutes), so Settings' "last used" is a true field rather
  than a column that can only ever be null.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta

from conftest import headers_for


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _issue_token(dsn: str, user_id: str, scopes: list[str], *, revoked: bool = False) -> str:
    """Insert a token the way the create endpoint stores one: hash only."""
    import asyncpg

    token = f"ssk_{uuid.uuid4().hex}"
    conn = await asyncpg.connect(dsn=dsn)
    try:
        await conn.execute(
            "insert into public.mcp_tokens (user_id, name, token_hash, token_prefix, scopes, revoked_at) "
            "values ($1, 'issued-by-test', $2, 'ssk_', $3, case when $4 then now() else null end)",
            user_id,
            _hash(token),
            scopes,
            revoked,
        )
    finally:
        await conn.close()
    return token


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _last_used(dsn: str, token: str):
    """Read last_used_at straight from the table — the ground truth."""
    import asyncpg

    conn = await asyncpg.connect(dsn=dsn)
    try:
        row = await conn.fetchrow(
            "select last_used_at from public.mcp_tokens where token_hash = $1",
            _hash(token),
        )
        return row["last_used_at"]
    finally:
        await conn.close()


async def _backdate(dsn: str, token: str, minutes: float) -> None:
    """Set last_used_at to `minutes` ago, as the DB's own clock sees it."""
    import asyncpg

    conn = await asyncpg.connect(dsn=dsn)
    try:
        await conn.execute(
            "update public.mcp_tokens set last_used_at = now() - $2::interval where token_hash = $1",
            _hash(token),
            timedelta(minutes=minutes),
        )
    finally:
        await conn.close()


async def test_token_reads_and_writes_as_its_owner(api_client, two_users, migrated_db):
    alice = two_users["alice"]
    token = await _issue_token(migrated_db, alice, ["read", "write"])

    me = await api_client.get("/api/me", headers=_auth(token))
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["id"] == alice
    assert body["email"] is None  # bare claims: identity without an address
    assert body["is_admin"] is False

    created = await api_client.post("/api/notes", json={"title": "from-alice-token"}, headers=_auth(token))
    assert created.status_code == 201, created.text


async def test_rows_a_token_touches_stay_inside_its_owner_rls(api_client, two_users, migrated_db):
    alice, bob = two_users["alice"], two_users["bob"]
    token = await _issue_token(migrated_db, alice, ["read", "write"])

    created = await api_client.post("/api/notes", json={"title": "token-private-note"}, headers=_auth(token))
    assert created.status_code == 201, created.text
    note_id = created.json()["id"]

    # Bob's session search never sees a row the token wrote.
    bob_hits = await api_client.get(
        "/api/notes", params={"q": "token-private-note"}, headers=headers_for(bob, "bob@test.dev")
    )
    assert bob_hits.status_code == 200, bob_hits.text
    assert all(row["id"] != note_id for row in bob_hits.json())

    # The holder reads back exactly its own row — no wider.
    mine = await api_client.get("/api/notes", params={"q": "token-private-note"}, headers=_auth(token))
    assert mine.status_code == 200, mine.text
    assert [row["id"] for row in mine.json()] == [note_id]


async def test_read_token_cannot_mutate(api_client, two_users, migrated_db):
    token = await _issue_token(migrated_db, two_users["alice"], ["read"])

    resp = await api_client.post("/api/notes", json={"title": "should-not-land"}, headers=_auth(token))
    assert resp.status_code == 403, resp.text
    assert "write" in resp.json()["detail"]


async def test_write_token_cannot_read(api_client, two_users, migrated_db):
    token = await _issue_token(migrated_db, two_users["alice"], ["write"])

    resp = await api_client.get("/api/me", headers=_auth(token))
    assert resp.status_code == 403, resp.text
    assert "read" in resp.json()["detail"]


async def test_revoked_token_is_rejected_on_the_next_request(api_client, two_users, migrated_db):
    token = await _issue_token(migrated_db, two_users["alice"], ["read"], revoked=True)

    resp = await api_client.get("/api/me", headers=_auth(token))
    assert resp.status_code == 401, resp.text


async def test_unknown_token_is_401_not_500(api_client, two_users, migrated_db):
    resp = await api_client.get("/api/me", headers=_auth("ssk_never-issued"))
    assert resp.status_code == 401, resp.text


async def test_token_path_cannot_reach_admin(api_client, two_users, migrated_db, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "alice@test.dev")
    from studyspace.config import get_settings

    get_settings.cache_clear()
    alice = two_users["alice"]

    # The same human's session JWT is admin...
    as_jwt = await api_client.get("/api/evals/runs", headers=headers_for(alice, "alice@test.dev"))
    assert as_jwt.status_code == 200, as_jwt.text

    # ...but a token carries no email, so the admin gate stays shut.
    token = await _issue_token(migrated_db, alice, ["read", "write"])
    as_token = await api_client.get("/api/evals/runs", headers=_auth(token))
    assert as_token.status_code == 403, as_token.text
    assert "Admin" in as_token.json()["detail"]


async def test_session_jwt_path_is_untouched(api_client, two_users):
    resp = await api_client.get("/api/me", headers=headers_for(two_users["alice"], "alice@test.dev"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["email"] == "alice@test.dev"


async def test_a_live_token_records_when_it_was_last_used(api_client, two_users, migrated_db):
    token = await _issue_token(migrated_db, two_users["alice"], ["read"])
    assert await _last_used(migrated_db, token) is None

    resp = await api_client.get("/api/me", headers=_auth(token))
    assert resp.status_code == 200, resp.text

    assert await _last_used(migrated_db, token) is not None


async def test_recording_is_throttled_inside_five_minutes(api_client, two_users, migrated_db):
    """Every MCP message verifies its token; a write per request would tax
    the hot path for a timestamp the UI prints as a date. A use five
    minutes or less after the last one leaves the column untouched."""
    token = await _issue_token(migrated_db, two_users["alice"], ["read"])
    await _backdate(migrated_db, token, 1)
    before = await _last_used(migrated_db, token)

    resp = await api_client.get("/api/me", headers=_auth(token))
    assert resp.status_code == 200, resp.text

    assert await _last_used(migrated_db, token) == before


async def test_a_stale_last_used_records_again(api_client, two_users, migrated_db):
    """Six minutes later the throttle window has passed and the column
    moves — "last used" stays roughly true without a write per request."""
    token = await _issue_token(migrated_db, two_users["alice"], ["read"])
    await _backdate(migrated_db, token, 6)
    before = await _last_used(migrated_db, token)

    resp = await api_client.get("/api/me", headers=_auth(token))
    assert resp.status_code == 200, resp.text

    assert await _last_used(migrated_db, token) != before

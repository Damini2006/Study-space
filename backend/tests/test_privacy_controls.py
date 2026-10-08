"""The privacy endpoints: /me/export and /me deletion, plus file cleanup.

GET /me/export and DELETE /me shipped without a single test, and account
deletion removed rows while leaving every stored file behind — the Landing
FAQ promises deletion removes "rows, embeddings and stored files". These
pin the honest version: stored documents are removed through the shared
intake service with the caller's own JWT, every outcome is counted and
reported instead of assumed, another user's files are never touched, and
the export carries only this account's rows.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from conftest import headers_for

from studyspace.config import get_settings
from studyspace.services.source_intake import StorageDeleteError, delete_from_storage

ALICE = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "email": "alice@test.dev"}
BOB = {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "email": "bob@test.dev"}


class _FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


@pytest.fixture()
def storage_stub(monkeypatch):
    """Replace the intake module's httpx with a recording stub for deletes."""
    import httpx

    import studyspace.services.source_intake as intake

    recorder = {"status_code": 200, "error": None, "calls": []}

    class _StubClient:
        def __init__(self, timeout=None) -> None:
            self._rec = recorder

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc) -> bool:
            return False

        async def delete(self, url, *, headers=None):
            self._rec["calls"].append({"method": "delete", "url": url, "headers": headers})
            if self._rec["error"] is not None:
                raise self._rec["error"]
            return _FakeResponse(self._rec["status_code"])

    monkeypatch.setattr(
        intake, "httpx", SimpleNamespace(AsyncClient=_StubClient, HTTPError=httpx.HTTPError)
    )
    return recorder


def _record_deletes(monkeypatch, module):
    """Record (token, path) pairs the router asks the intake service to remove."""
    calls: list[dict] = []

    async def fake(*, token: str, path: str) -> None:
        calls.append({"token": token, "path": path})

    monkeypatch.setattr(module, "delete_from_storage", fake)
    return calls


def _fail_deletes(monkeypatch, module) -> None:
    async def failing(*, token: str, path: str) -> None:
        raise StorageDeleteError("Storage removal failed (500).")

    monkeypatch.setattr(module, "delete_from_storage", failing)


async def _seed(migrated_db, user_id: str, space_title: str, storage_paths: list[str]) -> str:
    """A space with one stored source per path, written as the database user."""
    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        space_id = await conn.fetchval(
            "insert into public.spaces (user_id, title) values ($1, $2) returning id",
            user_id,
            space_title,
        )
        for i, path in enumerate(storage_paths):
            await conn.execute(
                "insert into public.sources (user_id, space_id, type, title, status, storage_path) "
                "values ($1, $2, 'markdown', $3, 'ready', $4)",
                user_id,
                space_id,
                f"doc {i}",
                path,
            )
        return str(space_id)
    finally:
        await conn.close()


async def _count(migrated_db, sql: str, *args) -> int:
    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


# ----- delete_from_storage: the request the service actually sends -----


async def test_delete_from_storage_sends_a_user_scoped_delete(storage_stub):
    settings = get_settings()
    path = f"{ALICE['id']}/{uuid.uuid4()}/{uuid.uuid4()}/notes.md"

    await delete_from_storage(token="user-jwt", path=path)

    call = storage_stub["calls"][0]
    assert call["method"] == "delete"
    assert call["url"] == f"{settings.storage_base}/object/sources/{path}"
    assert call["headers"]["Authorization"] == "Bearer user-jwt"
    assert call["headers"]["apikey"] == settings.supabase_anon_key


async def test_delete_from_storage_treats_a_missing_object_as_removed(storage_stub):
    # 404 means the object is already gone — the state the caller wanted.
    storage_stub["status_code"] = 404
    await delete_from_storage(token="t", path="u/s/o/f.md")
    assert len(storage_stub["calls"]) == 1


async def test_delete_from_storage_maps_a_rejection(storage_stub):
    storage_stub["status_code"] = 403
    with pytest.raises(StorageDeleteError) as excinfo:
        await delete_from_storage(token="t", path="u/s/o/f.md")
    assert "403" in str(excinfo.value)


async def test_delete_from_storage_maps_a_network_failure(storage_stub):
    import httpx

    storage_stub["error"] = httpx.ConnectError("connection refused")
    with pytest.raises(StorageDeleteError, match="could not be reached"):
        await delete_from_storage(token="t", path="u/s/o/f.md")


# ----- space deletion removes the files its sources point at -----


async def test_space_delete_removes_the_stored_files(
    api_client, migrated_db, two_users, monkeypatch
):
    from studyspace.routers import spaces as spaces_router

    h = headers_for(two_users["alice"], ALICE["email"])
    paths = [
        f"{two_users['alice']}/{uuid.uuid4()}/{uuid.uuid4()}/a.md",
        f"{two_users['alice']}/{uuid.uuid4()}/{uuid.uuid4()}/b.md",
    ]
    space_id = await _seed(migrated_db, two_users["alice"], "Space", paths)
    calls = _record_deletes(monkeypatch, spaces_router)

    resp = await api_client.delete(f"/api/spaces/{space_id}", headers=h)
    assert resp.status_code == 204

    assert sorted(c["path"] for c in calls) == sorted(paths)
    bearer = h["Authorization"].split(" ", 1)[1]
    assert all(c["token"] == bearer for c in calls)
    assert await _count(
        migrated_db, "select count(*) from public.sources where space_id = $1::uuid", space_id
    ) == 0


async def test_space_delete_without_stored_files_touches_no_storage(
    api_client, migrated_db, two_users, monkeypatch
):
    from studyspace.routers import spaces as spaces_router

    h = headers_for(two_users["alice"], ALICE["email"])
    space_id = await _seed(migrated_db, two_users["alice"], "Empty", [])
    calls = _record_deletes(monkeypatch, spaces_router)

    resp = await api_client.delete(f"/api/spaces/{space_id}", headers=h)
    assert resp.status_code == 204
    assert calls == []


async def test_source_delete_removes_its_file_through_the_shared_service(
    api_client, migrated_db, two_users, monkeypatch
):
    from studyspace.routers import sources as sources_router

    h = headers_for(two_users["alice"], ALICE["email"])
    path = f"{two_users['alice']}/{uuid.uuid4()}/{uuid.uuid4()}/one.md"
    space_id = await _seed(migrated_db, two_users["alice"], "Space", [path])
    calls = _record_deletes(monkeypatch, sources_router)

    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        source_id = await conn.fetchval(
            "select id from public.sources where space_id = $1::uuid", space_id
        )
    finally:
        await conn.close()

    resp = await api_client.delete(
        f"/api/spaces/{space_id}/sources/{source_id}", headers=h
    )
    assert resp.status_code == 204
    assert [c["path"] for c in calls] == [path]


async def test_source_delete_is_still_a_delete_when_storage_fails(
    api_client, migrated_db, two_users, monkeypatch
):
    """The row delete is what "deleted" means on a 204 endpoint; a failed
    file removal (an object no row references) must not resurrect it."""
    from studyspace.routers import sources as sources_router

    h = headers_for(two_users["alice"], ALICE["email"])
    path = f"{two_users['alice']}/{uuid.uuid4()}/{uuid.uuid4()}/one.md"
    space_id = await _seed(migrated_db, two_users["alice"], "Space", [path])
    _fail_deletes(monkeypatch, sources_router)

    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        source_id = await conn.fetchval(
            "select id from public.sources where space_id = $1::uuid", space_id
        )
    finally:
        await conn.close()

    resp = await api_client.delete(
        f"/api/spaces/{space_id}/sources/{source_id}", headers=h
    )
    assert resp.status_code == 204
    assert await _count(migrated_db, "select count(*) from public.sources where id = $1", source_id) == 0


# ----- account deletion: counted, reported, yours only -----


async def test_account_delete_removes_only_this_users_files_and_reports_counts(
    api_client, migrated_db, two_users, monkeypatch
):
    from studyspace.routers import me as me_router

    alice, bob = two_users["alice"], two_users["bob"]
    h = headers_for(alice, ALICE["email"])
    alice_paths = [
        f"{alice}/{uuid.uuid4()}/{uuid.uuid4()}/a.md",
        f"{alice}/{uuid.uuid4()}/{uuid.uuid4()}/b.md",
    ]
    bob_path = f"{bob}/{uuid.uuid4()}/{uuid.uuid4()}/bob.md"
    await _seed(migrated_db, alice, "Alice Space", alice_paths)
    await _seed(migrated_db, bob, "Bob Space", [bob_path])
    calls = _record_deletes(monkeypatch, me_router)

    resp = await api_client.delete("/api/me", headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["files_removed"] == 2
    assert body["files_failed"] == 0
    assert "all 2 stored documents" in body["detail"]
    assert "sign-in email remains" in body["detail"]

    assert sorted(c["path"] for c in calls) == sorted(alice_paths)
    assert bob_path not in [c["path"] for c in calls]

    assert await _count(
        migrated_db, "select count(*) from public.spaces where user_id = $1", alice
    ) == 0
    assert await _count(
        migrated_db, "select count(*) from public.sources where user_id = $1", alice
    ) == 0
    # Bob keeps his space, source and file.
    assert await _count(
        migrated_db, "select count(*) from public.spaces where user_id = $1", bob
    ) == 1
    assert bob_path in [
        r["storage_path"]
        for r in await _rows(migrated_db, "select storage_path from public.sources")
    ]


async def test_account_delete_reports_file_failures_instead_of_pretending(
    api_client, migrated_db, two_users, monkeypatch
):
    from studyspace.routers import me as me_router

    h = headers_for(two_users["alice"], ALICE["email"])
    paths = [
        f"{two_users['alice']}/{uuid.uuid4()}/{uuid.uuid4()}/a.md",
        f"{two_users['alice']}/{uuid.uuid4()}/{uuid.uuid4()}/b.md",
    ]
    await _seed(migrated_db, two_users["alice"], "Space", paths)
    _fail_deletes(monkeypatch, me_router)

    resp = await api_client.delete("/api/me", headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["files_removed"] == 0
    assert body["files_failed"] == 2
    assert "2 of 2 stored documents could not be removed" in body["detail"]
    # The rows are still gone: the count is reported, not retried forever.
    assert await _count(
        migrated_db, "select count(*) from public.spaces where user_id = $1",
        two_users["alice"],
    ) == 0


async def test_account_export_returns_only_this_users_rows(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], ALICE["email"])
    await _seed(migrated_db, two_users["alice"], "Alice Space", [])
    await _seed(migrated_db, two_users["bob"], "Bob Space", [])

    resp = await api_client.get("/api/me/export", headers=h)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/json")
    assert 'filename="studyspace-export.json"' in resp.headers["content-disposition"]

    payload = resp.json()
    assert payload["user"]["email"] == ALICE["email"]
    titles = [s["title"] for s in payload["data"]["spaces"]]
    assert "Alice Space" in titles
    assert "Bob Space" not in titles
    assert "Bob Space" not in resp.text
    # Every table the export documents is present, empty or not.
    for table in ("notes", "cards", "sources", "chat_threads", "review_logs"):
        assert table in payload["data"]


async def _rows(migrated_db, sql: str) -> list:
    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        return list(await conn.fetch(sql))
    finally:
        await conn.close()

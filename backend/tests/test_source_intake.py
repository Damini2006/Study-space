"""The shared intake service: storage paths, source rows, quota, HTTP mapping.

The upload and pasted endpoints and (from Track 12 on) the bundle import all
build sources through :mod:`studyspace.services.source_intake`. These tests
pin the three things that must not drift: the storage path layout, the row
shape, and the exception → status-code translation in the routers.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from conftest import headers_for

from studyspace.config import get_settings
from studyspace.db import user_conn
from studyspace.services.source_intake import (
    QuotaReached,
    StorageUploadError,
    check_quota,
    create_source,
    upload_to_storage,
)

ALICE = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "email": "alice@test.dev"}


class _FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


@pytest.fixture()
def storage_stub(monkeypatch):
    """Replace the intake module's httpx with a per-test recording stub.

    Yields the recorder dict: ``status_code`` for the canned response,
    ``error`` (an exception instance) to simulate a network failure, and
    ``calls`` with what was posted.
    """
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

        async def post(self, url, *, content=None, headers=None):
            self._rec["calls"].append({"url": url, "content": content, "headers": headers})
            if self._rec["error"] is not None:
                raise self._rec["error"]
            return _FakeResponse(self._rec["status_code"])

    monkeypatch.setattr(
        intake, "httpx", SimpleNamespace(AsyncClient=_StubClient, HTTPError=httpx.HTTPError)
    )
    return recorder


async def test_upload_to_storage_builds_a_user_scoped_path_and_headers(storage_stub):
    space_id = uuid.uuid4()
    source_id = uuid.uuid4()
    path = await upload_to_storage(
        token="user-jwt", user_id=ALICE["id"], space_id=space_id,
        source_id=source_id, filename="notes.md", data=b"# hi",
    )
    assert path == f"{ALICE['id']}/{space_id}/{source_id}/notes.md"

    settings = get_settings()
    call = storage_stub["calls"][0]
    assert call["url"] == f"{settings.storage_base}/object/sources/{path}"
    assert call["headers"]["Authorization"] == "Bearer user-jwt"
    assert call["headers"]["apikey"] == settings.supabase_anon_key
    assert call["headers"]["x-upsert"] == "true"
    assert call["content"] == b"# hi"


async def test_upload_to_storage_maps_a_storage_rejection(storage_stub):
    storage_stub["status_code"] = 404
    with pytest.raises(StorageUploadError) as excinfo:
        await upload_to_storage(
            token="t", user_id=ALICE["id"], space_id=uuid.uuid4(),
            source_id=uuid.uuid4(), filename="f.md", data=b"x",
        )
    message = str(excinfo.value)
    assert "404" in message
    assert "sources` bucket" in message


async def test_upload_to_storage_maps_a_network_failure(storage_stub):
    import httpx

    storage_stub["error"] = httpx.ConnectError("connection refused")
    with pytest.raises(StorageUploadError, match="Please retry"):
        await upload_to_storage(
            token="t", user_id=ALICE["id"], space_id=uuid.uuid4(),
            source_id=uuid.uuid4(), filename="f.md", data=b"x",
        )


async def test_create_source_inserts_a_queued_row_with_a_clamped_title(migrated_db, two_users):
    async with user_conn({"sub": two_users["alice"], "role": "authenticated"}) as conn:
        space_id = await conn.fetchval("insert into public.spaces (title) values ('Space') returning id")
        source_id = await create_source(
            conn, user_id=two_users["alice"], space_id=space_id, file_type="markdown",
            title="x" * 250, storage_path="u/s/o/notes.md", size_bytes=42,
        )
        row = await conn.fetchrow(
            "select status, type, size_bytes, char_length(title) as title_len "
            "from public.sources where id = $1",
            source_id,
        )
    assert row["status"] == "queued"
    assert row["type"] == "markdown"
    assert row["size_bytes"] == 42
    assert row["title_len"] == 200  # clamped to the column's cap


async def test_check_quota_allows_a_user_below_the_limit(migrated_db, two_users):
    async with user_conn({"sub": two_users["alice"], "role": "authenticated"}) as conn:
        space_id = await conn.fetchval("insert into public.spaces (title) values ('Space') returning id")
        await create_source(
            conn, user_id=two_users["alice"], space_id=space_id, file_type="pdf",
            title="big.pdf", storage_path=None, size_bytes=10 * 1024 * 1024,
        )
    # 10 MB used against the default 500 MB cap: must not raise.
    await check_quota(two_users["alice"])


async def test_check_quota_raises_when_the_limit_is_reached(migrated_db, monkeypatch):
    monkeypatch.setenv("STORAGE_QUOTA_MB", "0")
    get_settings.cache_clear()
    with pytest.raises(QuotaReached, match="quota reached"):
        await check_quota(ALICE["id"])


# ----- HTTP mapping in the upload/pasted routes -----


async def _create_space(api_client, h: dict) -> str:
    resp = await api_client.post("/api/spaces", json={"title": "Import Space"}, headers=h)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_upload_maps_a_storage_failure_to_502(api_client, migrated_db, two_users, monkeypatch):
    from studyspace.routers import sources as sources_router

    async def rejected(**kwargs):
        raise StorageUploadError(
            "Storage upload failed (404). Check SUPABASE_URL and that the `sources` bucket exists."
        )

    monkeypatch.setattr(sources_router, "upload_to_storage", rejected)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/sources/upload",
        files={"file": ("note.md", b"# hi", "text/markdown")},
        headers=h,
    )
    assert resp.status_code == 502
    assert "bucket" in resp.json()["detail"]


async def test_pasted_maps_a_storage_failure_to_502(api_client, migrated_db, two_users, monkeypatch):
    from studyspace.routers import sources as sources_router

    async def rejected(**kwargs):
        raise StorageUploadError("Storage upload failed. Please retry.")

    monkeypatch.setattr(sources_router, "upload_to_storage", rejected)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/sources/pasted",
        json={"title": "Lecture", "content": "# notes", "markdown": True},
        headers=h,
    )
    assert resp.status_code == 502


async def test_upload_when_the_queue_is_down_rolls_the_source_back(
    api_client, migrated_db, two_users, monkeypatch
):
    from studyspace.routers import sources as sources_router

    async def stored(**kwargs):
        return f"{kwargs['user_id']}/{kwargs['space_id']}/{kwargs['source_id']}/{kwargs['filename']}"

    async def down(**kwargs):
        raise RuntimeError("redis down")

    monkeypatch.setattr(sources_router, "upload_to_storage", stored)
    monkeypatch.setattr(sources_router, "enqueue_ingest", down)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/sources/upload",
        files={"file": ("note.md", b"# hi", "text/markdown")},
        headers=h,
    )
    assert resp.status_code == 503
    # The 503 rolled the request transaction back: no half-made source row.
    listed = await api_client.get(f"/api/spaces/{space_id}/sources", headers=h)
    assert listed.json() == []


async def test_upload_over_quota_is_413(api_client, migrated_db, two_users, monkeypatch):
    monkeypatch.setenv("STORAGE_QUOTA_MB", "0")
    get_settings.cache_clear()
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/sources/upload",
        files={"file": ("note.md", b"# hi", "text/markdown")},
        headers=h,
    )
    assert resp.status_code == 413
    assert "quota reached" in resp.json()["detail"]

"""POST /spaces/{id}/import: the bundle import end to end (no stub).

The claims under test: documents become stored sources that get queued
exactly like manual uploads, Anki cards land in the study queue due today,
every failure path answers honestly (400/413/429/502/503), and a failure
anywhere rolls the whole import back - no partial imports.
"""

from __future__ import annotations

from conftest import headers_for
from test_import_formats import make_apkg, make_zip

from studyspace.config import get_settings
from studyspace.services.source_intake import StorageUploadError


async def _create_space(api_client, h: dict) -> str:
    resp = await api_client.post("/api/spaces", json={"title": "Import Space"}, headers=h)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _wire_storage_and_queue(monkeypatch, *, fail_upload_after: int | None = None):
    """Record storage writes and enqueues; optionally fail the Nth upload."""
    from studyspace.routers import export as export_router

    stored: list[dict] = []
    queued: list[dict] = []

    async def fake_upload(**kwargs):
        stored.append(kwargs)
        if fail_upload_after is not None and len(stored) >= fail_upload_after:
            raise StorageUploadError("Storage upload failed. Please retry.")
        return f"{kwargs['user_id']}/{kwargs['space_id']}/{kwargs['source_id']}/{kwargs['filename']}"

    async def fake_enqueue(**kwargs):
        queued.append(kwargs)

    monkeypatch.setattr(export_router, "upload_to_storage", fake_upload)
    monkeypatch.setattr(export_router, "enqueue_ingest", fake_enqueue)
    return stored, queued


async def test_pdf_import_stores_the_file_and_queues_ingest(
    api_client, migrated_db, two_users, monkeypatch
):
    stored, queued = _wire_storage_and_queue(monkeypatch)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=pdf",
        files={"files": ("Lecture Notes.pdf", b"%PDF-1.4 fake", "application/pdf")},
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json() == {"format": "pdf", "sources": 1, "cards": 0, "skipped": 0, "warnings": []}
    assert stored[0]["filename"] == "Lecture_Notes.pdf"  # sanitised for storage

    listed = await api_client.get(f"/api/spaces/{space_id}/sources", headers=h)
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["type"] == "pdf" and rows[0]["status"] == "queued"
    assert rows[0]["title"] == "Lecture_Notes.pdf"

    assert len(queued) == 1
    assert queued[0]["file_type"] == "pdf"
    assert queued[0]["pasted_text"] is None  # worker downloads and extracts


async def test_obsidian_zip_creates_markdown_sources_with_pasted_text(
    api_client, migrated_db, two_users, monkeypatch
):
    _, queued = _wire_storage_and_queue(monkeypatch)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    vault = make_zip({"Week 1/lecture.md": "# Photosynthesis", "lab.md": "# Lab notes"})
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=obsidian",
        files={"files": ("vault.zip", vault, "application/zip")},
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["sources"] == 2

    listed = await api_client.get(f"/api/spaces/{space_id}/sources", headers=h)
    rows = listed.json()
    assert len(rows) == 2
    assert all(r["type"] == "markdown" and r["status"] == "queued" for r in rows)
    assert {r["title"] for r in rows} == {"lecture", "lab"}

    assert len(queued) == 2
    assert all(j["pasted_text"] for j in queued)  # text rides with the job


async def test_notion_loose_csv_becomes_a_text_source(
    api_client, migrated_db, two_users, monkeypatch
):
    _wire_storage_and_queue(monkeypatch)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=notion",
        files={"files": ("table.csv", b"Name,Date\nAda,1815\n", "text/csv")},
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["sources"] == 1

    listed = await api_client.get(f"/api/spaces/{space_id}/sources", headers=h)
    assert listed.json()[0]["type"] == "text"


async def test_anki_import_lands_cards_in_the_due_queue(
    api_client, migrated_db, two_users, monkeypatch
):
    _wire_storage_and_queue(monkeypatch)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    apkg = make_apkg(
        notes=[("What is ATP?\x1fEnergy currency", "bio", 1)],
        decks=((1, "Bio::Cells"),),
    )
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=anki",
        files={"files": ("deck.apkg", apkg, "application/octet-stream")},
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json() == {
        "format": "anki", "sources": 0, "cards": 1, "skipped": 0, "warnings": [],
    }

    due = await api_client.get("/api/study/due", headers=h)
    assert due.status_code == 200
    body = due.json()
    assert body["due_count"] == 1
    assert body["cards"][0]["front"] == "What is ATP?"
    assert "Bio::Cells" in body["cards"][0]["tags"]


async def test_wrong_extension_is_400(api_client, migrated_db, two_users):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=anki",
        files={"files": ("deck.zip", b"PK\x03\x04", "application/zip")},
        headers=h,
    )
    assert resp.status_code == 400
    assert "expected one of" in resp.json()["detail"]


async def test_empty_file_is_400(api_client, migrated_db, two_users):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=obsidian",
        files={"files": ("note.md", b"", "text/markdown")},
        headers=h,
    )
    assert resp.status_code == 400
    assert "empty" in resp.json()["detail"]


async def test_import_into_another_users_space_is_404(api_client, migrated_db, two_users):
    alice = headers_for(two_users["alice"], "alice@test.dev")
    bob = headers_for(two_users["bob"], "bob@test.dev")
    space_id = await _create_space(api_client, alice)
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=pdf",
        files={"files": ("x.pdf", b"%PDF", "application/pdf")},
        headers=bob,
    )
    assert resp.status_code == 404


async def test_import_over_quota_is_413(api_client, migrated_db, two_users, monkeypatch):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    monkeypatch.setenv("STORAGE_QUOTA_MB", "0")
    get_settings.cache_clear()
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=pdf",
        files={"files": ("x.pdf", b"%PDF", "application/pdf")},
        headers=h,
    )
    assert resp.status_code == 413
    assert "quota reached" in resp.json()["detail"]


async def test_import_file_over_size_limit_is_413(api_client, migrated_db, two_users, monkeypatch):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    get_settings.cache_clear()
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=obsidian",
        files={"files": ("big.md", b"x" * (1024 * 1024 + 1), "text/markdown")},
        headers=h,
    )
    assert resp.status_code == 413
    assert "1 MB" in resp.json()["detail"]


async def test_import_rate_limited_is_429(api_client, migrated_db, two_users, monkeypatch):
    from studyspace.routers import export as export_router

    class Denied:
        allowed = False
        remaining = 0
        retry_after = 60

    async def denied(*args, **kwargs):
        return Denied()

    monkeypatch.setattr(export_router, "rate_limit", denied)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=pdf",
        files={"files": ("x.pdf", b"%PDF", "application/pdf")},
        headers=h,
    )
    assert resp.status_code == 429


async def test_too_many_files_is_400(api_client, migrated_db, two_users, monkeypatch):
    from studyspace.services.import_formats import MAX_IMPORT_FILES

    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    # The count is checked before a single byte is read: if the oversized
    # member were read first it would answer 413 instead.
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    get_settings.cache_clear()
    parts = [("files", (f"note{i}.md", b"# x", "text/markdown")) for i in range(MAX_IMPORT_FILES)]
    parts.append(("files", ("oversized.md", b"x" * (1024 * 1024 + 1), "text/markdown")))
    resp = await api_client.post(f"/api/spaces/{space_id}/import?fmt=obsidian", files=parts, headers=h)
    assert resp.status_code == 400
    assert "at most" in resp.json()["detail"]


async def test_storage_failure_is_502(api_client, migrated_db, two_users, monkeypatch):
    from studyspace.routers import export as export_router

    async def rejected(**kwargs):
        raise StorageUploadError("Storage upload failed. Please retry.")

    monkeypatch.setattr(export_router, "upload_to_storage", rejected)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=pdf",
        files={"files": ("x.pdf", b"%PDF", "application/pdf")},
        headers=h,
    )
    assert resp.status_code == 502


async def test_a_failure_halfway_rolls_the_whole_import_back(
    api_client, migrated_db, two_users, monkeypatch
):
    stored, queued = _wire_storage_and_queue(monkeypatch, fail_upload_after=2)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    vault = make_zip({"first.md": "# one", "second.md": "# two"})
    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=obsidian",
        files={"files": ("vault.zip", vault, "application/zip")},
        headers=h,
    )
    assert resp.status_code == 502
    assert len(stored) == 2  # first succeeded, second failed...
    assert queued == []      # ...and no job ever went out
    listed = await api_client.get(f"/api/spaces/{space_id}/sources", headers=h)
    assert listed.json() == []  # first source rolled back with the request


async def test_queue_failure_is_503_with_no_partial_import(
    api_client, migrated_db, two_users, monkeypatch
):
    from studyspace.routers import export as export_router

    _wire_storage_and_queue(monkeypatch)

    async def down(**kwargs):
        raise RuntimeError("redis down")

    monkeypatch.setattr(export_router, "enqueue_ingest", down)
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    resp = await api_client.post(
        f"/api/spaces/{space_id}/import?fmt=pdf",
        files={"files": ("x.pdf", b"%PDF", "application/pdf")},
        headers=h,
    )
    assert resp.status_code == 503
    listed = await api_client.get(f"/api/spaces/{space_id}/sources", headers=h)
    assert listed.json() == []

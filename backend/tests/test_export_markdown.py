"""GET /spaces/{id}/export?fmt=markdown|notion: real content, safe entries.

The claims under test: source files carry the chunk text the worker
extracted (not a "Content pending extraction." placeholder), note files
and CSV rows carry content_text (the jsonb document never renders),
zip entry names cannot escape the archive or overwrite each other, and
the response is an honestly-typed zip.
"""

from __future__ import annotations

import csv
import io
import zipfile

from conftest import headers_for
from test_import_route import _create_space

CHUNK_1 = "Mitochondria are the powerhouse of the cell."
CHUNK_2 = "They burn glucose to make ATP."
NOTE_TEXT = "Light reactions make ATP and NADPH."
CSV_MARKER = "'type': 'doc'"


async def _seed_source_and_chunks(migrated_db, user_id, space_id):
    """A ready source with two chunks, plus one with no text at all.

    Only the (absent) worker can produce ready sources, so this goes in
    through SQL the way the worker's own writes would look.
    """
    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        source_id = await conn.fetchval(
            "insert into public.sources (user_id, space_id, type, title, status) "
            "values ($1, $2, 'markdown', 'Lecture 1', 'ready') returning id",
            user_id,
            space_id,
        )
        await conn.execute(
            "insert into public.chunks (user_id, source_id, space_id, content, position) "
            "values ($1, $2, $3, $4, 0), ($1, $2, $3, $5, 1)",
            user_id,
            source_id,
            space_id,
            CHUNK_1,
            CHUNK_2,
        )
        await conn.execute(
            "insert into public.sources (user_id, space_id, type, title, status) "
            "values ($1, $2, 'text', 'Untouched', 'ready')",
            user_id,
            space_id,
        )
        await conn.execute(
            "insert into public.cards (user_id, space_id, front, back, tags) "
            "values ($1, $2, 'What is ATP?', 'Energy currency', $3)",
            user_id,
            space_id,
            ["bio"],
        )
    finally:
        await conn.close()


async def _seed_notes(api_client, h, space_id):
    """Notes through the real API: one normal, one hostile title, two twins."""
    created = []
    for title, text in [
        ("Photosynthesis", NOTE_TEXT),
        ("../../escape", "I escaped."),
        ("Duplicate", "Dup one."),
        ("Duplicate", "Dup two."),
    ]:
        resp = await api_client.post(
            "/api/notes",
            json={"title": title, "content_text": text, "tags": ["bio"], "space_id": space_id},
            headers=h,
        )
        assert resp.status_code == 201, resp.text
        created.append(resp.json())
    return created


async def _export_files(api_client, h, space_id, fmt) -> dict[str, str]:
    resp = await api_client.get(f"/api/spaces/{space_id}/export?fmt={fmt}", headers=h)
    assert resp.status_code == 200, resp.text
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        return {name: zf.read(name).decode("utf-8") for name in zf.namelist()}


async def _seeded_space(api_client, migrated_db, two_users) -> tuple[dict, dict]:
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    await _seed_source_and_chunks(migrated_db, two_users["alice"], space_id)
    await _seed_notes(api_client, h, space_id)
    return h, {"space": space_id}


async def test_source_files_carry_the_extracted_chunk_text(
    api_client, migrated_db, two_users
):
    h, seed = await _seeded_space(api_client, migrated_db, two_users)
    files = await _export_files(api_client, h, seed["space"], "markdown")

    source_files = {n: body for n, body in files.items() if n.startswith("sources/")}
    assert len(source_files) == 2
    joined = "\n".join(source_files.values())
    assert CHUNK_1 in joined and CHUNK_2 in joined
    assert joined.index(CHUNK_1) < joined.index(CHUNK_2)  # position order
    assert "(no extracted text)" in joined  # the empty source says so
    assert "Content pending extraction." not in joined


async def test_note_files_carry_content_text_not_the_jsonb_document(
    api_client, migrated_db, two_users
):
    h, seed = await _seeded_space(api_client, migrated_db, two_users)
    files = await _export_files(api_client, h, seed["space"], "markdown")

    photo = next(body for body in files.values() if NOTE_TEXT in body)
    assert "Light reactions make ATP and NADPH." in photo
    assert CSV_MARKER not in photo
    assert '"type": "doc"' not in photo  # the jsonb document never renders


async def test_notion_csv_rows_carry_the_real_note_text(
    api_client, migrated_db, two_users
):
    h, seed = await _seeded_space(api_client, migrated_db, two_users)
    resp = await api_client.get(
        f"/api/spaces/{seed['space']}/export?fmt=notion", headers=h
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")

    rows = list(csv.DictReader(io.StringIO(resp.text)))
    assert len(rows) == 4  # every note we created made a row
    by_title = {row["Title"]: row for row in rows}
    assert by_title["Photosynthesis"]["Content"] == NOTE_TEXT
    assert "bio" in by_title["Photosynthesis"]["Tags"]
    assert by_title["../../escape"]["Content"] == "I escaped."
    assert all(row["Content"] for row in rows)  # no empty Content column
    assert CSV_MARKER not in resp.text


async def test_entry_names_cannot_escape_or_overwrite_each_other(
    api_client, migrated_db, two_users
):
    h, seed = await _seeded_space(api_client, migrated_db, two_users)
    files = await _export_files(api_client, h, seed["space"], "markdown")

    names = list(files)
    assert len(names) == len(set(names))  # duplicates got counters, not overwrites
    assert all(".." not in name and not name.startswith("/") for name in names)

    # The hostile title survives as content under a safe, generated name.
    assert any("I escaped." in body for body in files.values())
    dupes = "\n".join(body for body in files.values() if body.startswith("# Duplicate"))
    assert dupes.count("# Duplicate") == 2  # both twins are present...
    assert "Dup one." in dupes and "Dup two." in dupes  # ...with their own text


async def test_zip_headers_and_standalone_files(
    api_client, migrated_db, two_users
):
    h, seed = await _seeded_space(api_client, migrated_db, two_users)
    resp = await api_client.get(
        f"/api/spaces/{seed['space']}/export?fmt=markdown", headers=h
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/zip")
    assert resp.headers["content-disposition"].endswith('.zip"')

    files = await _export_files(api_client, h, seed["space"], "markdown")
    assert "README.md" in files and "cards.md" in files
    assert "Import Space" in files["README.md"]
    assert "What is ATP?" in files["cards.md"]

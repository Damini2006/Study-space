"""Notes: content_text is the plain text of the document.

Nothing ever derived content_text from the jsonb document and the client
never sent it, so every app-created note stored content_text = '':
`q=` search (ilike over content_text) never matched a body phrase and
exported note files rendered empty even though the export code promises
the note's text. These tests pin the derivation: creates and content
changes derive the plain text in SQL, the client's own plain text is
only a fallback for content-less writers, and the shared extractor walks
TipTap documents without leaking markup metadata (hrefs, ids).
"""

from __future__ import annotations

from conftest import headers_for
from test_export_markdown import _export_files
from test_import_route import _create_space

DOC_TEXT = "Osmosis moves water across the membrane."
SECOND_TEXT = "Active transport pumps against the gradient."
FALLBACK_TEXT = "MCP fallback words."
EMPTY_DOC: dict = {"type": "doc", "content": []}


def doc_with(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]}
        ],
    }


async def _create(api_client, h, **kwargs):
    payload = {"title": kwargs.pop("title", "Transport"), **kwargs}
    resp = await api_client.post("/api/notes", json=payload, headers=h)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _search(api_client, h, q: str) -> list[dict]:
    resp = await api_client.get("/api/notes", params={"q": q}, headers=h)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_create_derives_plain_text_from_the_document(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    note = await _create(api_client, h, content=doc_with(DOC_TEXT))

    assert DOC_TEXT in note["content_text"]
    matches = await _search(api_client, h, "osmosis moves water")
    assert [n["id"] for n in matches] == [note["id"]]


async def test_client_plain_text_stands_in_for_an_empty_document(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    note = await _create(
        api_client, h, content=EMPTY_DOC, content_text=FALLBACK_TEXT
    )

    assert note["content_text"] == FALLBACK_TEXT
    matches = await _search(api_client, h, "MCP fallback")
    assert [n["id"] for n in matches] == [note["id"]]


async def test_changing_the_content_rederives_the_plain_text(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    note = await _create(api_client, h, content=doc_with(DOC_TEXT))

    resp = await api_client.patch(
        f"/api/notes/{note['id']}", json={"content": doc_with(SECOND_TEXT)}, headers=h
    )
    assert resp.status_code == 200, resp.text
    assert SECOND_TEXT in resp.json()["content_text"]
    assert DOC_TEXT not in resp.json()["content_text"]

    assert [n["id"] for n in await _search(api_client, h, "against the gradient")] == [
        note["id"]
    ]
    assert await _search(api_client, h, "osmosis moves water") == []


async def test_unrelated_updates_leave_the_plain_text_alone(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    note = await _create(api_client, h, content=doc_with(DOC_TEXT))

    resp = await api_client.patch(
        f"/api/notes/{note['id']}", json={"pinned": True}, headers=h
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["pinned"] is True
    assert DOC_TEXT in resp.json()["content_text"]


async def test_exported_note_files_carry_the_document_text(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)
    note = await _create(api_client, h, space_id=space_id, content=doc_with(DOC_TEXT))
    assert DOC_TEXT in note["content_text"]

    files = await _export_files(api_client, h, space_id, "markdown")
    note_files = {n: body for n, body in files.items() if n.startswith("notes/")}
    assert note_files, "the export should contain the note file"
    assert any(DOC_TEXT in body for body in note_files.values())


async def test_the_sql_extractor_walks_the_document_without_the_attrs(
    migrated_db, two_users
):
    import asyncpg

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        text = await conn.fetchval(
            "select public.jsonb_tiptap_text($1::jsonb)",
            '{"type":"doc","content":['
            '{"type":"paragraph","content":[{"type":"text","text":"Real words"}]},'
            '{"type":"heading","attrs":{"level":2},'
            '"content":[{"type":"text","text":"A heading"}]},'
            # An image has no text of its own, so its attrs are reachable
            # by the walker — only the attrs exclusion keeps src out.
            '{"type":"image","attrs":{"src":"https://example.com/pic.png"}}'
            "]}",
        )
    finally:
        await conn.close()

    assert "Real words" in text
    assert "A heading" in text
    assert "https://example.com/pic.png" not in text  # attrs are not student text
    assert "paragraph" not in text  # node names are not student text

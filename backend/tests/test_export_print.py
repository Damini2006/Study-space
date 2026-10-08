"""GET /spaces/{id}/export?fmt=pdf: an honest print page, not HTML in a .pdf.

The claims under test: the response is served as text/html with an .html
filename (the browser's Save-as-PDF makes the actual file), every user
string is escaped so a hostile card or title cannot smuggle markup into
the downloaded page, note bodies come from content_text (the jsonb
document never renders), and ``print=1`` is what adds the auto-print
script - never by default.
"""

from __future__ import annotations

from conftest import headers_for
from test_import_route import _create_space

from studyspace.services.export_formats import build_print_html

PAYLOAD = "<script>alert(1)</script>"

SOURCES = [{"title": "Lecture 1", "type": "pdf"}]
CARDS = [
    {"front": "What is ATP?", "back": "Energy currency", "tags": ["bio"]},
    {"front": "Q2", "back": "A2", "tags": []},
]
NOTES = [{"title": "Synthesis", "content_text": "The real note text.", "content": "IGNORED jsonb document"}]


def test_page_has_print_css_sections_and_counts():
    page = build_print_html("Bio 101", SOURCES, CARDS, NOTES)
    assert page.startswith("<!doctype html>")
    assert "@page" in page and "page-break-inside: avoid" in page
    assert "<h2>Sources</h2>" in page and "<h2>Cards</h2>" in page and "<h2>Notes</h2>" in page
    assert "Sources: 1 &middot; Cards: 2 &middot; Notes: 1" in page
    assert "What is ATP?" in page and "Lecture 1" in page


def test_every_user_string_is_escaped_not_executed():
    hostile_source = [{"title": PAYLOAD, "type": "pdf"}]
    hostile_cards = [{"front": PAYLOAD, "back": PAYLOAD, "tags": [PAYLOAD]}]
    hostile_notes = [{"title": PAYLOAD, "content_text": PAYLOAD}]
    page = build_print_html(PAYLOAD, hostile_source, hostile_cards, hostile_notes)

    assert PAYLOAD not in page  # never a raw angle bracket from user data
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page
    assert "<script>window.print()</script>" not in page  # only with auto_print


def test_note_bodies_come_from_content_text_not_the_jsonb_document():
    page = build_print_html("Space", [], [], NOTES)
    assert "The real note text." in page
    assert "IGNORED jsonb document" not in page


def test_auto_print_script_only_when_asked():
    assert "window.print()" in build_print_html("S", [], [], [], auto_print=True)
    assert "window.print()" not in build_print_html("S", [], [], [], auto_print=False)


def test_empty_sections_say_so_honestly():
    page = build_print_html("Bare", [], [], [])
    assert "(no ready sources in this space)" in page
    assert "(no cards in this space)" in page
    assert "(no notes in this space)" in page
    assert "Sources: 0 &middot; Cards: 0 &middot; Notes: 0" in page


async def test_pdf_export_is_served_as_honest_html_with_an_html_filename(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    resp = await api_client.post(
        "/api/spaces", json={"title": "<b>Bo</b> & Co"}, headers=h
    )
    assert resp.status_code == 201, resp.text
    space_id = resp.json()["id"]

    export = await api_client.get(f"/api/spaces/{space_id}/export?fmt=pdf", headers=h)
    assert export.status_code == 200, export.text
    assert export.headers["content-type"].startswith("text/html")
    assert export.headers["content-type"] != "application/pdf"
    assert export.headers["content-disposition"].endswith('.html"')

    body = export.text
    assert body.startswith("<!doctype html>")
    assert "<b>Bo</b> & Co" not in body  # the space title stays inert
    assert "&lt;b&gt;Bo&lt;/b&gt; &amp; Co" in body


async def test_print_param_is_the_only_thing_that_adds_the_print_script(
    api_client, migrated_db, two_users
):
    h = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h)

    plain = await api_client.get(f"/api/spaces/{space_id}/export?fmt=pdf", headers=h)
    assert plain.status_code == 200
    assert "window.print()" not in plain.text

    printing = await api_client.get(
        f"/api/spaces/{space_id}/export?fmt=pdf&print=1", headers=h
    )
    assert printing.status_code == 200
    assert "window.print()" in printing.text

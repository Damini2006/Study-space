"""GET /spaces/{id}/export?fmt=anki: the Anki export is a real .apkg.

The claims under test: the bytes are a zip wrapping a standard Anki
collection (col/notes/cards/decks plus the model and deck JSON Anki
reads), the response is honest about what it is (zip type, .apkg
filename - not the old JSON manifest wearing an .apkg name), and the
package round trips through our own import parser: import, export,
parse, same cards back.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sqlite3
import tempfile
import zipfile
from typing import Any

from conftest import headers_for
from test_import_formats import make_apkg
from test_import_route import _create_space, _wire_storage_and_queue

from studyspace.services.export_formats import build_apkg
from studyspace.services.import_formats import parse_uploads

CARDS = [
    ("What is ATP?", "Energy currency of the cell", ("bio", "Cells")),
    ("What is DNA?", "Double helix", ("bio",)),
]


def _read(pkg: bytes) -> dict[str, Any]:
    """Unpack an .apkg and pull everything we pin into plain values."""
    with zipfile.ZipFile(io.BytesIO(pkg)) as zf:
        names = zf.namelist()
        media = zf.read("media").decode("utf-8")
        db_bytes = zf.read("collection.anki2")
    fd, path = tempfile.mkstemp(suffix=".anki2")
    os.close(fd)
    try:
        with open(path, "wb") as fh:
            fh.write(db_bytes)
        conn = sqlite3.connect(path)
        try:
            tables = {
                row[0]
                for row in conn.execute("select name from sqlite_master where type = 'table'")
            }
            col = conn.execute(
                "select id, ver, conf, models, decks, dconf from col"
            ).fetchone()
            notes = conn.execute(
                "select id, guid, mid, tags, flds, csum from notes order by id"
            ).fetchall()
            cards = conn.execute(
                "select id, nid, did, ord, type, queue, due from cards order by due"
            ).fetchall()
            decks = conn.execute("select id, name from decks order by id").fetchall()
            tags = conn.execute("select tag from tags").fetchall()
        finally:
            conn.close()
    finally:
        os.unlink(path)
    return {
        "names": names,
        "media": media,
        "tables": tables,
        "col": col,
        "notes": notes,
        "cards": cards,
        "decks": decks,
        "tags": tags,
    }


def test_apkg_is_a_zip_with_a_collection_and_a_media_manifest():
    out = _read(build_apkg("Bio 101", CARDS))
    assert out["names"] == ["collection.anki2", "media"]
    assert out["media"] == "{}"  # no sound files travel with the deck
    assert {"col", "notes", "cards", "decks", "tags", "revlog", "graves"} <= out["tables"]


def test_collection_json_declares_the_space_as_deck_and_a_front_back_model():
    out = _read(build_apkg("Bio 101", CARDS))
    _cid, _ver, conf, models, decks, dconf = out["col"]

    model = next(iter(json.loads(models).values()))
    assert [f["name"] for f in model["flds"]] == ["Front", "Back"]
    assert model["tmpls"][0]["qfmt"] == "{{Front}}"

    deck = next(iter(json.loads(decks).values()))
    assert deck["name"] == "Bio 101"
    assert out["decks"] == [(deck["id"], "Bio 101")]  # table agrees with the JSON
    assert json.loads(conf)["curDeck"] == deck["id"]
    assert "1" in json.loads(dconf)  # the deck points at conf 1

    mids = {note[2] for note in out["notes"]}
    assert mids == {model["id"]}


def test_notes_and_cards_follow_anki_conventions():
    out = _read(build_apkg("Bio 101", CARDS))
    _cid, _ver, _conf, models, _decks, _dconf = out["col"]
    model_id = next(iter(json.loads(models).values()))["id"]
    deck_id = out["decks"][0][0]

    for note, (front, back, tags) in zip(out["notes"], CARDS, strict=True):
        _nid, guid, mid, tags_field, flds, csum = note
        assert flds == f"{front}\x1f{back}"
        assert tags_field == "".join(f" {t}" for t in tags) + " "
        assert csum == int(hashlib.sha1(front.encode("utf-8")).hexdigest()[:8], 16)
        assert mid == model_id
    assert len({note[1] for note in out["notes"]}) == len(CARDS)  # distinct guids

    assert [card[6] for card in out["cards"]] == [1, 2]  # new-queue position
    note_ids = {note[0] for note in out["notes"]}
    for card in out["cards"]:
        _cid_, nid, did, ord_, type_, queue, _due = card
        assert (ord_, type_, queue) == (0, 0, 0)  # template 1, new, new queue
        assert did == deck_id
        assert nid in note_ids

    assert {row[0] for row in out["tags"]} == {"bio", "Cells"}


def test_an_empty_deck_is_still_a_valid_package():
    pkg = build_apkg("Empty", [])
    out = _read(pkg)
    assert out["names"] == ["collection.anki2", "media"]
    assert out["notes"] == [] and out["cards"] == []

    bundle = parse_uploads("anki", [("Empty.apkg", pkg)])
    assert bundle.cards == []
    assert bundle.skipped == 0
    # Empty is reported honestly rather than silently.
    assert bundle.warnings == ["No importable notes found in the Anki collection."]


def test_round_trip_through_our_own_import_parser():
    """Export -> our Track 12 parser -> the same cards, deck tag included."""
    pkg = build_apkg("Biology::Cells", CARDS)
    bundle = parse_uploads("anki", [("deck.apkg", pkg)])
    assert bundle.skipped == 0 and bundle.warnings == []
    assert [(c.front, c.back) for c in bundle.cards] == [(f, b) for f, b, _ in CARDS]

    atp = next(c for c in bundle.cards if c.front == "What is ATP?")
    assert {"Biology::Cells", "bio", "Cells"} <= set(atp.tags)


async def test_export_endpoint_serves_the_package_with_an_honest_zip_type(
    api_client, migrated_db, two_users, monkeypatch
):
    """The full loop: cards in via import, out via export, parsed back."""
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

    export = await api_client.get(f"/api/spaces/{space_id}/export?fmt=anki", headers=h)
    assert export.status_code == 200, export.text
    assert export.headers["content-type"].startswith("application/zip")
    assert export.headers["content-disposition"].endswith('.apkg"')

    bundle = parse_uploads("anki", [("exported.apkg", export.content)])
    assert bundle.skipped == 0 and bundle.warnings == []
    assert [c.front for c in bundle.cards] == ["What is ATP?"]
    # Deck tag is the space title now; the original deck tag survived too.
    assert {"Import Space", "Bio::Cells", "bio"} <= set(bundle.cards[0].tags)


async def test_export_of_another_users_space_is_404_and_anon_is_401(
    api_client, migrated_db, two_users
):
    h_alice = headers_for(two_users["alice"], "alice@test.dev")
    space_id = await _create_space(api_client, h_alice)

    h_bob = headers_for(two_users["bob"], "bob@test.dev")
    resp = await api_client.get(f"/api/spaces/{space_id}/export?fmt=anki", headers=h_bob)
    assert resp.status_code == 404

    anon = await api_client.get(f"/api/spaces/{space_id}/export?fmt=anki")
    assert anon.status_code == 401

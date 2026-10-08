"""Bundle parsers: what PDF/Obsidian/Notion/Anki imports become.

No database here — these are pure functions over bytes, so the fixtures are
synthesized in-code: zips from dicts, .apkg packages from a real (minimal)
SQLite collection, exactly what the parsers will meet in production.
"""

from __future__ import annotations

import io
import json
import os
import sqlite3
import tempfile
import zipfile

import pytest

from studyspace.services import import_formats
from studyspace.services.import_formats import (
    BundleError,
    PdfDoc,
    TextDoc,
    parse_uploads,
)


def make_zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def make_apkg(
    notes: list[tuple[str, str, int]],
    decks: tuple[tuple[int, str], ...] = ((1, "Default"),),
    media: tuple[str, ...] = (),
    extra_cards: tuple[tuple[int, int], ...] = (),
) -> bytes:
    """Build a minimal .apkg: SQLite collection + media, zipped."""
    fd, path = tempfile.mkstemp(suffix=".anki2")
    os.close(fd)
    try:
        conn = sqlite3.connect(path)
        conn.executescript(
            # Column names follow the real Anki schema: notes are keyed by
            # `id`, cards reference them via `nid` (caught by the export
            # round-trip test in test_export_anki.py).
            "create table notes (id integer primary key, flds text, tags text);"
            "create table cards (nid integer, did integer);"
            "create table decks (id integer primary key, name text);"
        )
        for nid, (flds, tags, did) in enumerate(notes, start=1):
            conn.execute("insert into notes values (?, ?, ?)", (nid, flds, tags))
            conn.execute("insert into cards values (?, ?)", (nid, did))
        conn.executemany("insert into cards values (?, ?)", extra_cards)
        conn.executemany("insert into decks values (?, ?)", decks)
        conn.commit()
        conn.close()
        with open(path, "rb") as fh:
            db_bytes = fh.read()
    finally:
        os.unlink(path)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("collection.anki2", db_bytes)
        zf.writestr("media", json.dumps({str(i): f"sound{i}.mp3" for i, _ in enumerate(media)}))
        for i, name in enumerate(media):
            zf.writestr(str(i), f"ID3:{name}".encode())
    return buf.getvalue()


# ----- pdf -----


def test_pdf_bytes_pass_through_as_a_single_document():
    bundle = parse_uploads("pdf", [("Lecture Notes.PDF", b"%PDF-1.4 fake")])
    assert len(bundle.docs) == 1
    doc = bundle.docs[0]
    assert isinstance(doc, PdfDoc)
    assert doc.filename == "Lecture_Notes.PDF"  # storage name is sanitised
    assert doc.data == b"%PDF-1.4 fake"
    assert bundle.cards == [] and bundle.skipped == 0


def test_wrong_extension_for_the_format_is_rejected():
    with pytest.raises(BundleError, match="expected one of"):
        parse_uploads("obsidian", [("deck.apkg", b"pk..")])
    with pytest.raises(BundleError, match="Unknown import format"):
        parse_uploads("powerpoint", [])


def test_too_many_uploaded_files_is_rejected():
    uploads = [(f"note{i}.md", b"# x") for i in range(import_formats.MAX_IMPORT_FILES + 1)]
    with pytest.raises(BundleError, match="at most"):
        parse_uploads("obsidian", uploads)


def test_empty_file_is_rejected():
    with pytest.raises(BundleError, match="empty"):
        parse_uploads("obsidian", [("note.md", b"")])


# ----- obsidian / notion archives -----


def test_obsidian_zip_yields_one_document_per_markdown_file():
    bundle = parse_uploads(
        "obsidian",
        [
            (
                "vault.zip",
                make_zip(
                    {
                        "Lecture 1.md": "# Photosynthesis",
                        "week/note.md": "# Spaced repetition",
                        "img.png": b"\x89PNG-not-wanted",
                        "readme.txt": b"not wanted either",
                    }
                ),
            )
        ],
    )
    assert [d.title for d in bundle.docs] == ["Lecture 1", "note"]
    assert all(isinstance(d, TextDoc) and d.file_type == "markdown" for d in bundle.docs)
    assert bundle.docs[0].text == "# Photosynthesis"
    assert bundle.skipped == 2  # png + txt
    assert bundle.cards == []


def test_obsidian_skips_hidden_entries():
    bundle = parse_uploads(
        "obsidian",
        [("vault.zip", make_zip({".obsidian/templates/tpl.md": "# tpl", "note.md": "# real"}))],
    )
    assert [d.title for d in bundle.docs] == ["note"]
    assert bundle.skipped == 1


def test_loose_markdown_file_for_obsidian():
    bundle = parse_uploads("obsidian", [("My Note.md", b"# hi")])
    doc = bundle.docs[0]
    assert isinstance(doc, TextDoc)
    assert doc.title == "My Note"
    assert doc.text == "# hi"
    assert doc.file_type == "markdown"


def test_notion_zip_yields_markdown_and_csv_documents():
    bundle = parse_uploads(
        "notion",
        [
            (
                "Export.zip",
                make_zip(
                    {
                        "Export/Page.md": "# Page body",
                        "Export/Database/db.csv": b"Name,Date\nAda,1815\n",
                        "Export/assets/img.png": b"\x89PNG",
                    }
                ),
            )
        ],
    )
    by_title = {d.title: d for d in bundle.docs}
    assert set(by_title) == {"Page", "db"}
    assert by_title["Page"].file_type == "markdown"
    assert by_title["db"].file_type == "text"
    assert by_title["db"].text == "Name,Date\nAda,1815\n"
    assert bundle.skipped == 1


def test_loose_csv_for_notion_becomes_a_text_document():
    bundle = parse_uploads("notion", [("table.csv", b"a,b\n1,2\n")])
    doc = bundle.docs[0]
    assert isinstance(doc, TextDoc)
    assert doc.file_type == "text"
    assert doc.title == "table"


def test_non_zip_archive_is_rejected():
    with pytest.raises(BundleError, match="not a valid zip"):
        parse_uploads("obsidian", [("vault.zip", b"certainly not a zip")])


def test_oversized_zip_entry_is_skipped_with_a_warning(monkeypatch):
    monkeypatch.setattr(import_formats, "MAX_ENTRY_BYTES", 10)
    bundle = parse_uploads(
        "obsidian",
        [("vault.zip", make_zip({"big.md": b"x" * 50, "small.md": b"# ok"}))],
    )
    assert [d.title for d in bundle.docs] == ["small"]
    assert bundle.skipped == 1
    assert any("larger than" in w for w in bundle.warnings)


def test_zip_entry_reads_never_exceed_the_entry_bound(monkeypatch):
    """The parser pulls at most cap+1 bytes at a time - a huge entry must
    not be materialised in memory just to be thrown away."""
    sizes: list[int] = []
    original_read = zipfile.ZipExtFile.read

    def spy(self, amt=-1):
        sizes.append(amt)
        return original_read(self, amt)

    monkeypatch.setattr(zipfile.ZipExtFile, "read", spy)
    bundle = parse_uploads("obsidian", [("vault.zip", make_zip({"a.md": b"x" * 100}))])
    assert len(bundle.docs) == 1
    assert sizes and all(n == import_formats.MAX_ENTRY_BYTES + 1 for n in sizes)


def test_text_budget_is_enforced_across_uploads(monkeypatch):
    monkeypatch.setattr(import_formats, "MAX_BUNDLE_BYTES", 100)
    bundle = parse_uploads(
        "obsidian",
        [("a.md", b"x" * 60), ("b.md", b"y" * 60)],
    )
    assert len(bundle.docs) == 1
    assert bundle.skipped == 1
    assert any("Text limit" in w for w in bundle.warnings)


def _mark_encrypted(zip_bytes: bytes, entry: str) -> bytes:
    """Flip the zip encryption bit for `entry` - writestr clears it, so the
    header bytes are patched directly: flag at +8 of the central record,
    mirrored into the local header at its +6."""
    data = bytearray(zip_bytes)
    name = entry.encode()
    pos = 0
    while True:
        i = data.find(b"PK\x01\x02", pos)
        if i < 0:
            raise AssertionError(f"central record for {entry} not found")
        if bytes(data[i + 46 : i + 46 + len(name)]) == name:
            data[i + 8] |= 1
            offset = int.from_bytes(data[i + 42 : i + 46], "little")
            assert bytes(data[offset : offset + 4]) == b"PK\x03\x04"
            data[offset + 6] |= 1
            return bytes(data)
        pos = i + 4


def test_encrypted_zip_entry_is_skipped_not_fatal():
    raw = _mark_encrypted(make_zip({"locked.md": b"# secret", "open.md": b"# fine"}), "locked.md")
    bundle = parse_uploads("obsidian", [("vault.zip", raw)])
    assert [d.title for d in bundle.docs] == ["open"]
    assert bundle.skipped == 1
    assert any("could not be read" in w for w in bundle.warnings)


def test_warnings_collapse_and_stay_bounded():
    bundle = import_formats.ParsedBundle()
    bundle.warn("same")
    bundle.warn("same")
    assert bundle.warnings == ["same"]
    for i in range(20):
        bundle.warn(f"warning {i}")
    assert len(bundle.warnings) <= 11
    assert bundle.warnings[-1] == "(further warnings omitted)"


def test_document_cap_applies_to_a_whole_vault(monkeypatch):
    monkeypatch.setattr(import_formats, "MAX_BUNDLE_DOCS", 3)
    entries = {f"note{i}.md": b"# x" for i in range(5)}
    bundle = parse_uploads("obsidian", [("vault.zip", make_zip(entries))])
    assert len(bundle.docs) == 3
    assert bundle.skipped == 2
    assert any("Document limit" in w for w in bundle.warnings)


def test_dotfile_loose_upload_still_gets_a_title():
    bundle = parse_uploads("obsidian", [(".md", b"# hidden-ish")])
    assert bundle.docs[0].title == "Untitled"


# ----- anki -----


def test_anki_apkg_yields_cards_with_deck_and_tags():
    apkg = make_apkg(
        notes=[("What is ATP?\x1fEnergy currency of the cell", "bio exam", 1)],
        decks=((1, "Biology::Cells"),),
    )
    bundle = parse_uploads("anki", [("deck.apkg", apkg)])
    assert len(bundle.cards) == 1
    card = bundle.cards[0]
    assert card.front == "What is ATP?"
    assert card.back == "Energy currency of the cell"
    assert card.tags == ("Biology::Cells", "bio", "exam")


def test_anki_notes_without_a_back_are_skipped():
    apkg = make_apkg(notes=[("Just a front, no answer field", "", 1)])
    bundle = parse_uploads("anki", [("deck.apkg", apkg)])
    assert bundle.cards == []
    assert bundle.skipped == 1
    assert any("No importable notes" in w for w in bundle.warnings)


def test_anki_fields_are_clamped_to_the_column_caps():
    apkg = make_apkg(notes=[("f" * 5000 + "\x1f" + "b" * 9000, "", 1)])
    bundle = parse_uploads("anki", [("deck.apkg", apkg)])
    card = bundle.cards[0]
    assert len(card.front) == 4000
    assert len(card.back) == 8000


def test_notes_with_multiple_cards_import_once():
    # A real note often has one card per deck; it must not import twice.
    apkg = make_apkg(
        notes=[("Q\x1fA", "", 1)],
        decks=((1, "Deck One"), (2, "Deck Two")),
        extra_cards=((1, 2),),  # the same note also has a card in deck two
    )
    bundle = parse_uploads("anki", [("deck.apkg", apkg)])
    assert len(bundle.cards) == 1
    assert bundle.cards[0].tags == ("Deck One",)


def test_anki_card_limit_stops_reading_and_counts_the_rest(monkeypatch):
    monkeypatch.setattr(import_formats, "MAX_IMPORT_CARDS", 3)
    apkg = make_apkg(notes=[(f"Q{i}\x1fA{i}", "", 1) for i in range(5)])
    bundle = parse_uploads("anki", [("deck.apkg", apkg)])
    assert len(bundle.cards) == 3
    assert bundle.skipped == 2
    assert any("Card limit" in w for w in bundle.warnings)


def test_collection_reader_itself_stops_at_the_cap(monkeypatch):
    """The reader (not just the merge step) stops pulling rows, so a huge
    collection is never materialised in memory."""
    monkeypatch.setattr(import_formats, "MAX_IMPORT_CARDS", 3)
    apkg = make_apkg(notes=[(f"Q{i}\x1fA{i}", "", 1) for i in range(5)])
    part = import_formats._parse_anki("deck.apkg", apkg)
    assert len(part.cards) == 3
    assert part.skipped == 2
    assert any("Card limit" in w for w in part.warnings)


def test_card_cap_applies_across_multiple_apkg_files(monkeypatch):
    monkeypatch.setattr(import_formats, "MAX_IMPORT_CARDS", 3)
    one = make_apkg(notes=[("Q1\x1fA1", "", 1)])
    two = make_apkg(notes=[("Q2\x1fA2", "", 1), ("Q3\x1fA3", "", 1), ("Q4\x1fA4", "", 1)])
    bundle = parse_uploads("anki", [("a.apkg", one), ("b.apkg", two)])
    assert len(bundle.cards) == 3
    assert bundle.skipped == 1
    assert any("Card limit" in w for w in bundle.warnings)


def test_anki_media_counts_as_skipped():
    apkg = make_apkg(notes=[("Q\x1fA", "", 1)], media=("sound.mp3",))
    bundle = parse_uploads("anki", [("deck.apkg", apkg)])
    assert len(bundle.cards) == 1
    assert bundle.skipped == 1  # the media file


def test_note_tags_are_capped():
    tags = " ".join(f"t{i}" for i in range(30))
    apkg = make_apkg(notes=[("Q\x1fA", tags, 1)])
    bundle = parse_uploads("anki", [("deck.apkg", apkg)])
    assert len(bundle.cards[0].tags) == 20  # deck tag + note tags, capped


def test_anki21_only_package_warns_instead_of_crashing():
    pkg = make_zip({"collection.anki21": b"zstd-bytes"})
    bundle = parse_uploads("anki", [("deck.apkg", pkg)])
    assert bundle.cards == []
    assert any("older Anki versions" in w for w in bundle.warnings)


def test_apkg_without_a_collection_is_rejected():
    with pytest.raises(BundleError, match="no Anki collection"):
        parse_uploads("anki", [("deck.apkg", make_zip({"readme.txt": b"hi"}))])


def test_corrupt_collection_is_a_bundle_error_not_a_crash():
    pkg = make_zip({"collection.anki2": b"this is not sqlite at all"})
    with pytest.raises(BundleError, match="could not be read"):
        parse_uploads("anki", [("deck.apkg", pkg)])

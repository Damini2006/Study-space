"""Bundle parsers for ``POST /spaces/{space_id}/import``: what each format becomes.

Pure functions over bytes: no database, no storage, no FastAPI. The router
does the persisting; this does the understanding.

Format contracts (decided in Track 12):
- pdf     -> one document per file; the ingestion worker extracts its text.
- obsidian -> one document per .md file, loose or inside a vault .zip.
- notion   -> one document per .md/.csv entry, loose or in an export .zip.
- anki     -> flashcards (front/back/tags) for the FSRS study queue.

Caps are module constants rather than settings: they bound what a single
request may parse (a denial-of-service limit whose breach is a client
error), not a knob an operator tunes per deployment.
"""

from __future__ import annotations

import io
import os
import sqlite3
import tempfile
import zipfile
from dataclasses import dataclass, field

from studyspace.security import sanitize_filename

MAX_IMPORT_FILES = 20  # uploaded files per import request
MAX_BUNDLE_DOCS = 200  # documents one import may create
MAX_IMPORT_CARDS = 2000  # cards one import may create
MAX_ENTRY_BYTES = 2 * 1024 * 1024  # one md/csv entry read from a zip
MAX_BUNDLE_BYTES = 25 * 1024 * 1024  # total document text per import
MAX_DB_BYTES = 64 * 1024 * 1024  # collection.anki2 read bound (zip-bomb guard)

_MAX_WARNINGS = 10
_MAX_TAGS = 20
_FIELD_SEP = "\x1f"

# Which file extensions each import format accepts (the dialog offers the
# matching accept list; the server is the authority on it).
ALLOWED_EXTENSIONS: dict[str, tuple[str, ...]] = {
    "pdf": (".pdf",),
    "obsidian": (".zip", ".md"),
    "notion": (".zip", ".md", ".csv"),
    "anki": (".apkg",),
}


class BundleError(ValueError):
    """A user-facing parse failure: the message is safe to return as a 400."""


@dataclass(frozen=True)
class PdfDoc:
    """A PDF passed through untouched, to be extracted by the worker."""

    filename: str
    data: bytes


@dataclass(frozen=True)
class TextDoc:
    """A document whose text is already in memory (.md/.csv from a bundle)."""

    filename: str
    title: str
    text: str
    file_type: str  # "markdown" | "text"


Document = PdfDoc | TextDoc


@dataclass(frozen=True)
class Card:
    front: str
    back: str
    tags: tuple[str, ...]


@dataclass
class ParsedBundle:
    docs: list[Document] = field(default_factory=list)
    cards: list[Card] = field(default_factory=list)
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)
    text_bytes: int = 0

    def warn(self, message: str) -> None:
        """Record a warning; identical messages collapse, list stays bounded."""
        if message in self.warnings:
            return
        if len(self.warnings) < _MAX_WARNINGS:
            self.warnings.append(message)
        elif "(further warnings omitted)" not in self.warnings:
            self.warnings.append("(further warnings omitted)")

    def extend(self, other: ParsedBundle) -> None:
        """Merge another parse result, applying the import-wide caps."""
        for doc in other.docs:
            if len(self.docs) >= MAX_BUNDLE_DOCS:
                self.skipped += 1
                self.warn(f"Document limit ({MAX_BUNDLE_DOCS}) reached; remaining files were skipped.")
                continue
            if isinstance(doc, TextDoc):
                size = len(doc.text.encode("utf-8"))
                if self.text_bytes + size > MAX_BUNDLE_BYTES:
                    self.skipped += 1
                    self.warn("Text limit for one import reached; remaining documents were skipped.")
                    continue
                self.text_bytes += size
            self.docs.append(doc)
        for card in other.cards:
            if len(self.cards) >= MAX_IMPORT_CARDS:
                self.skipped += 1
                self.warn(f"Card limit ({MAX_IMPORT_CARDS}) reached; remaining cards were skipped.")
                continue
            self.cards.append(card)
        self.skipped += other.skipped
        for message in other.warnings:
            self.warn(message)


def _ext(filename: str) -> str:
    name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    return "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""


def parse_uploads(fmt: str, uploads: list[tuple[str, bytes]]) -> ParsedBundle:
    """Parse every uploaded ``(filename, bytes)`` pair for format ``fmt``.

    Raises :class:`BundleError` for anything the user must fix (wrong
    extension, unreadable archive, empty file); skips-and-counts entries
    that are merely not importable (assets, oversized notes, media).
    """
    if fmt not in ALLOWED_EXTENSIONS:
        raise BundleError(f"Unknown import format '{fmt}'.")
    if len(uploads) > MAX_IMPORT_FILES:
        raise BundleError(f"Too many files: one import accepts at most {MAX_IMPORT_FILES} files.")

    allowed = ALLOWED_EXTENSIONS[fmt]
    for filename, data in uploads:
        if _ext(filename) not in allowed:
            raise BundleError(
                f"'{filename}' is not a {fmt} import: expected one of {', '.join(allowed)}."
            )
        if not data:
            raise BundleError(f"'{filename}' is empty.")

    bundle = ParsedBundle()
    for filename, data in uploads:
        bundle.extend(_PARSERS[fmt](filename, data))
    return bundle


def _parse_pdf(filename: str, data: bytes) -> ParsedBundle:
    # The worker does text extraction; here the bytes just have to survive
    # the trip to storage under a safe name.
    return ParsedBundle(docs=[PdfDoc(filename=sanitize_filename(filename), data=data)])


def _parse_obsidian(filename: str, data: bytes) -> ParsedBundle:
    if _ext(filename) == ".zip":
        return _docs_from_zip(data, wanted={".md"}, archive=filename)
    return ParsedBundle(docs=[_text_doc(filename, data)])


def _parse_notion(filename: str, data: bytes) -> ParsedBundle:
    if _ext(filename) == ".zip":
        return _docs_from_zip(data, wanted={".md", ".csv"}, archive=filename)
    return ParsedBundle(docs=[_text_doc(filename, data)])


def _text_doc(filename: str, content: bytes) -> TextDoc:
    """A document's title keeps its human name (spaces and all); only the
    storage filename gets sanitised."""
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    stem = base.rsplit(".", 1)[0] if "." in base else base
    title = "".join(ch for ch in stem if ch.isprintable()).strip() or "Untitled"
    text = content.decode("utf-8", errors="replace")
    file_type = "markdown" if _ext(filename) in {".md", ".markdown"} else "text"
    return TextDoc(filename=sanitize_filename(filename), title=title, text=text, file_type=file_type)


def _is_hidden(name: str) -> bool:
    return any(part.startswith(".") for part in name.split("/") if part)


def _docs_from_zip(data: bytes, *, wanted: set[str], archive: str) -> ParsedBundle:
    """One TextDoc per matching zip entry; assets and junk are counted."""
    bundle = ParsedBundle()
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise BundleError(f"'{archive}' is not a valid zip archive.") from exc

    total = 0
    with zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            if _ext(name) not in wanted or _is_hidden(name):
                bundle.skipped += 1
                continue
            if total >= MAX_BUNDLE_BYTES:
                bundle.skipped += 1
                bundle.warn("Text limit for one import reached; remaining documents were skipped.")
                continue
            try:
                with zf.open(info) as fh:
                    raw = fh.read(MAX_ENTRY_BYTES + 1)  # bounded: never trust declared sizes
            except (RuntimeError, NotImplementedError, OSError, zipfile.BadZipFile):
                bundle.skipped += 1
                bundle.warn(f"'{name}' could not be read (encrypted or corrupt) and was skipped.")
                continue
            if len(raw) > MAX_ENTRY_BYTES:
                bundle.skipped += 1
                bundle.warn(f"'{name}' is larger than {MAX_ENTRY_BYTES // (1024 * 1024)} MB and was skipped.")
                continue
            total += len(raw)
            base = name.rsplit("/", 1)[-1]
            bundle.docs.append(_text_doc(base, raw))
    return bundle


def _parse_anki(filename: str, data: bytes) -> ParsedBundle:
    bundle = ParsedBundle()
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise BundleError(f"'{filename}' is not a valid .apkg package.") from exc

    with zf:
        names = set(zf.namelist())
        if "collection.anki2" not in names:
            if "collection.anki21" in names:
                # Anki 23+ stores a zstd-compressed collection this Python
                # cannot open. Honest advice beats a crash.
                bundle.warn(
                    "'collection.anki21' is a newer zstd-compressed Anki format; "
                    "re-export the deck with 'Support older Anki versions' and import again."
                )
                return bundle
            raise BundleError(f"'{filename}' has no Anki collection inside - is it a real .apkg export?")

        try:
            with zf.open("collection.anki2") as fh:
                db_bytes = fh.read(MAX_DB_BYTES + 1)
        except (RuntimeError, zipfile.BadZipFile, OSError) as exc:
            raise BundleError(f"'{filename}' contains an unreadable Anki collection.") from exc
        if len(db_bytes) > MAX_DB_BYTES:
            raise BundleError(
                f"'{filename}' has a collection larger than {MAX_DB_BYTES // (1024 * 1024)} MB."
            )
        # Everything else in the package is media or bookkeeping: report it.
        bundle.skipped += sum(1 for n in names if n not in {"collection.anki2", "media"})

    _read_cards(db_bytes, bundle)
    return bundle


def _read_cards(db_bytes: bytes, bundle: ParsedBundle) -> None:
    """Stream cards out of the embedded SQLite collection into ``bundle``."""
    fd, path = tempfile.mkstemp(suffix=".anki2")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(db_bytes)
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            cursor = conn.execute(
                "select n.flds, n.tags, d.name as deck from notes n "
                "left join (select nid, min(did) as did from cards group by nid) c on c.nid = n.nid "
                "left join decks d on d.id = c.did"
            )
            while True:
                rows = cursor.fetchmany(500)
                if not rows:
                    break
                for flds, tags, deck in rows:
                    if len(bundle.cards) >= MAX_IMPORT_CARDS:
                        bundle.skipped += 1
                        bundle.warn(
                            f"Card limit ({MAX_IMPORT_CARDS}) reached; remaining cards were skipped."
                        )
                        continue
                    card = _card_from_row(flds or "", tags or "", deck)
                    if card is None:
                        bundle.skipped += 1  # no front, or no back to answer with
                        continue
                    bundle.cards.append(card)
        except sqlite3.DatabaseError as exc:
            raise BundleError("The Anki collection could not be read.") from exc
        finally:
            conn.close()
        if not bundle.cards:
            bundle.warn("No importable notes found in the Anki collection.")
    finally:
        os.unlink(path)


def _card_from_row(flds: str, tags: str, deck: str | None) -> Card | None:
    fields = flds.split(_FIELD_SEP)
    front = fields[0].strip()
    back = "\n".join(part.strip() for part in fields[1:] if part.strip())
    if not front or not back:
        # The cards table requires 1..4000 / 1..8000 characters; a note with
        # no answer field (e.g. cloze-only) has no back to store.
        return None
    return Card(front=front[:4000], back=back[:8000], tags=_card_tags(tags, deck))


def _card_tags(raw_tags: str, deck: str | None) -> tuple[str, ...]:
    """Deck path first (it says where the card came from), then note tags."""
    out: list[str] = []
    if deck:
        out.append(deck)
    for tag in raw_tags.split():
        if tag not in out:
            out.append(tag)
    return tuple(t[:100] for t in out[:_MAX_TAGS])


_PARSERS = {
    "pdf": _parse_pdf,
    "obsidian": _parse_obsidian,
    "notion": _parse_notion,
    "anki": _parse_anki,
}

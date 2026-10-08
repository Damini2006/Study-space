"""What each export format becomes: rows in the shape the format promises.

Pure functions over data - no database, no FastAPI. The router fetches the
rows; this builds the payload. Each builder answers to its own contract:

- :func:`build_apkg` produces a real .apkg: a zip wrapping a standard Anki
  collection (col/notes/cards/decks tables plus the model and deck JSON
  Anki reads). Both Anki and our own import parser
  (``services/import_formats.py``) can read it back - the round trip
  through that parser is the test that pins it.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import secrets
import sqlite3
import tempfile
import time
import zipfile
from collections.abc import Sequence

# Anki's own collection layout (2.1 era), reproduced so the file we emit is
# a collection rather than something that merely resembles one. Anki's
# importer selects these columns by name; extras are harmless, absences are
# not.
_COL_DDL = (
    "create table col ("
    "id integer primary key, crt integer not null, mod integer not null,"
    "scm integer not null, ver integer not null, dver integer not null,"
    "usn integer not null, ls integer not null, conf text not null,"
    "models text not null, decks text not null, dconf text not null, tags text not null)"
)
_NOTES_DDL = (
    "create table notes ("
    "id integer primary key, guid text not null, mid integer not null,"
    "mod integer not null, usn integer not null, tags text not null,"
    "flds text not null, crt integer not null, csum integer not null,"
    "flags integer not null, data text not null)"
)
_CARDS_DDL = (
    "create table cards ("
    "id integer primary key, nid integer not null, did integer not null,"
    "ord integer not null, mod integer not null, usn integer not null,"
    "type integer not null, queue integer not null, due integer not null,"
    "ivl integer not null, factor integer not null, reps integer not null,"
    "lapses integer not null, left integer not null, odue integer not null,"
    "odid integer not null, flags integer not null, data text not null)"
)
_DECKS_DDL = (
    "create table decks ("
    "id integer primary key, name text not null default '',"
    "mod integer not null default 1, usn integer not null default 0,"
    "common integer not null default 0, collapsed integer not null default 0,"
    "browserCollapsed integer not null default 0, desc text not null default '',"
    "dyn integer not null default 0, conf integer not null default 1,"
    "extendNew integer not null default 0, extendRev integer not null default 0)"
)
_GRAVES_DDL = "create table graves (usn integer not null, oid integer not null, type integer not null)"
_REVLOG_DDL = (
    "create table revlog ("
    "id integer primary key, cid integer not null, usn integer not null,"
    "ease integer not null, ivl integer not null, lastIvl integer not null,"
    "factor integer not null, time integer not null, type integer not null)"
)
_TAGS_DDL = "create table tags (tag text not null primary key, tags text not null)"

_FIELD_SEP = "\x1f"  # the field separator Anki stores multi-field notes with
_MODEL_CSS = ".card { font-family: arial; font-size: 20px; text-align: left; color: black; background-color: white; }"


def _basic_model(model_id: int, deck_id: int) -> dict:
    """Anki's stock "Basic" note type: a Front field and a Back field."""
    return {
        "id": model_id,
        "name": "Basic",
        "type": 0,  # standard, not cloze
        "mod": 0,
        "usn": -1,
        "sortf": 0,
        "did": deck_id,
        "tmpls": [
            {
                "name": "Card 1",
                "ord": 0,
                "qfmt": "{{Front}}",
                "afmt": '{{FrontSide}}<hr id="answer">{{Back}}',
                "did": None,
                "bqfmt": "",
                "bafmt": "",
                "bfont": "",
                "bsize": 0,
            }
        ],
        "flds": [
            {"name": "Front", "ord": 0, "sticky": False, "rtl": False, "font": "Arial", "size": 20, "media": []},
            {"name": "Back", "ord": 1, "sticky": False, "rtl": False, "font": "Arial", "size": 20, "media": []},
        ],
        "css": _MODEL_CSS,
        "latexPre": "\\documentclass[12pt]{article}\n\\begin{document}",
        "latexPost": "\\end{document}",
        "latexsvg": False,
        "req": [[0, "any", [0]]],  # a card needs the Front field
        "vers": [],
    }


def _deck(deck_id: int, name: str, now_ms: int) -> dict:
    return {
        "id": deck_id,
        "name": name,
        "mod": now_ms,
        "usn": -1,
        "collapsed": False,
        "browserCollapsed": False,
        "desc": "",
        "dyn": 0,
        "conf": 1,
        "extendNew": 10,
        "extendRev": 50,
    }


def _deck_conf(conf_id: int = 1) -> dict:
    """Anki's stock deck configuration (the "Default" one)."""
    return {
        "id": conf_id,
        "name": "Default",
        "mod": 0,
        "usn": -1,
        "maxTaken": 60,
        "autoplay": True,
        "timer": 0,
        "replayq": True,
        "new": {
            "bury": False,
            "delays": [1, 10],
            "initialFactor": 2500,
            "ints": [1, 4, 0],
            "order": 1,
            "perDay": 20,
            "separate": True,
        },
        "rev": {
            "bury": False,
            "ease4": 1.3,
            "fuzz": 0.05,
            "ivlFct": 1,
            "maxIvl": 36500,
            "minSpace": 1,
            "perDay": 200,
            "hardFactor": 1.2,
        },
        "lapse": {"delays": [10], "leechAction": 0, "leechFails": 8, "minInt": 1, "mult": 0},
        "dyn": False,
    }


def _col_conf(next_pos: int, deck_id: int) -> dict:
    return {
        "nextPos": next_pos,
        "estTimes": True,
        "activeDecks": [deck_id],
        "sortType": "noteFld",
        "timeLim": 0,
        "sortBackwards": False,
        "addToCur": True,
        "curDeck": deck_id,
        "newBury": True,
        "newSpread": 0,
        "dueCounter": next_pos,
        "collapseTime": 1200,
    }


def _note_checksum(front: str) -> int:
    """Anki's duplicate checksum: first 8 hex digits of sha1 of the first field."""
    return int(hashlib.sha1(front.encode("utf-8")).hexdigest()[:8], 16)


def _anki_tags(tags: Sequence[str]) -> str:
    """Anki stores tags space-separated with surrounding spaces ('' when none)."""
    kept = [f" {t}" for t in tags if t]
    return "".join(kept) + (" " if kept else "")


def build_apkg(deck_name: str, cards: Sequence[tuple[str, str, Sequence[str]]]) -> bytes:
    """Build a .apkg: a zip wrapping a standard Anki collection.

    ``cards`` are ``(front, back, tags)`` triples; the deck is named after
    the space. New cards are queued in order (due = 1..n), matching what
    Anki does with a freshly imported deck.
    """
    now = int(time.time())
    now_ms = now * 1000
    deck_id = now_ms
    model_id = now_ms + 1

    fd, path = tempfile.mkstemp(suffix=".anki2")
    os.close(fd)
    try:
        conn = sqlite3.connect(path)
        try:
            conn.executescript(
                ";".join(
                    [
                        _COL_DDL,
                        _NOTES_DDL,
                        _CARDS_DDL,
                        _DECKS_DDL,
                        _GRAVES_DDL,
                        _REVLOG_DDL,
                        _TAGS_DDL,
                    ]
                )
            )
            deck = _deck(deck_id, deck_name, now_ms)
            conn.execute(
                "insert into decks values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    deck["id"],
                    deck["name"],
                    deck["mod"],
                    deck["usn"],
                    0,  # common
                    0,  # collapsed
                    0,  # browserCollapsed
                    deck["desc"],
                    deck["dyn"],
                    deck["conf"],
                    deck["extendNew"],
                    deck["extendRev"],
                ),
            )
            conn.execute(
                "insert into col values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    1,  # the collection id
                    now,  # crt: collection creation (seconds)
                    now_ms,  # mod
                    now_ms,  # scm: schema mod time
                    11,  # ver: the collection version Anki 2.1 writes
                    0,  # dver: deck version
                    -1,  # usn
                    0,  # ls
                    json.dumps(_col_conf(len(cards) + 1, deck_id), separators=(",", ":")),
                    json.dumps({str(model_id): _basic_model(model_id, deck_id)}, separators=(",", ":")),
                    json.dumps({str(deck_id): deck}, separators=(",", ":")),
                    json.dumps({"1": _deck_conf()}, separators=(",", ":")),
                    "{}",
                ),
            )
            seen_tags: set[str] = set()
            for i, (front, back, tags) in enumerate(cards):
                note_id = now_ms + i
                conn.execute(
                    "insert into notes values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        note_id,
                        secrets.token_urlsafe(9),  # guid: Anki's dedupe key
                        model_id,
                        now,  # mod (seconds)
                        -1,  # usn
                        _anki_tags(tags),
                        f"{front}{_FIELD_SEP}{back}",
                        now,  # crt
                        _note_checksum(front),
                        0,  # flags
                        "",  # data
                    ),
                )
                conn.execute(
                    "insert into cards values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        now_ms + 1_000_000 + i,  # card id (unique within cards)
                        note_id,
                        deck_id,
                        0,  # ord: template 1
                        now,  # mod
                        -1,  # usn
                        0,  # type: new
                        0,  # queue: new
                        i + 1,  # due: position in the new queue
                        0,  # ivl
                        0,  # factor (new cards carry no ease yet)
                        0,  # reps
                        0,  # lapses
                        0,  # left
                        0,  # odue
                        0,  # odid
                        0,  # flags
                        "",  # data
                    ),
                )
                for tag in tags:
                    if tag and tag not in seen_tags:
                        seen_tags.add(tag)
                        conn.execute("insert or ignore into tags values (?, ?)", (tag, ""))
            conn.commit()
            with open(path, "rb") as fh:
                db_bytes = fh.read()
        finally:
            conn.close()
    finally:
        os.unlink(path)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr("collection.anki2", db_bytes)
        zf.writestr("media", "{}")  # no sound/video files travel with the deck
    return buf.getvalue()

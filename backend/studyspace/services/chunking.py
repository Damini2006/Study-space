"""Text chunking: overlapping windows with page provenance.

Target size is ~500-800 tokens (~2000-3200 chars) with overlap, split at
sentence/paragraph boundaries so citations land on readable passages.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass

from studyspace.config import get_settings

_SENTENCE_ENDINGS = (".", "!", "?", "\n")


@dataclass
class PageText:
    page: int | None
    text: str


@dataclass
class Chunk:
    content: str
    page: int | None
    position: int
    token_count: int


def estimate_tokens(text: str) -> int:
    """Cheap token estimate (~4 chars/token for English study material)."""
    return max(1, len(text) // 4)


def _clean(text: str) -> str:
    # normalise whitespace but keep paragraph breaks
    lines = [ln.strip() for ln in text.splitlines()]
    out: list[str] = []
    blank = True
    for ln in lines:
        if not ln:
            if not blank:
                out.append("")
            blank = True
        else:
            out.append(ln)
            blank = False
    cleaned = "\n".join(out)
    while "\n\n\n" in cleaned:
        cleaned = cleaned.replace("\n\n\n", "\n\n")
    return cleaned.strip()


def _find_boundary(text: str, start: int, hard_end: int, min_end: int) -> int:
    """Pick a cut point in [min_end, hard_end] preferring sentence ends."""
    window = text[min_end:hard_end]
    best = -1
    for idx in range(len(window) - 1, -1, -1):
        if window[idx] in _SENTENCE_ENDINGS:
            # include trailing quote/paren and swallow following spaces
            cut = min_end + idx + 1
            while cut < hard_end and text[cut] in '"\')”’':
                cut += 1
            best = cut
            break
    if best != -1:
        return best
    # no sentence end — try a space
    space = text.rfind(" ", min_end, hard_end)
    if space != -1:
        return space
    return hard_end


def chunk_pages(
    pages: list[PageText],
    *,
    target_chars: int | None = None,
    overlap_chars: int | None = None,
) -> list[Chunk]:
    """Split page-aware text into overlapping chunks.

    Every character of input appears in at least one chunk, chunks never
    exceed ``target_chars + overlap_chars`` and each chunk carries the page
    of its first character.
    """
    settings = get_settings()
    target = target_chars or settings.chunk_target_chars
    overlap = overlap_chars if overlap_chars is not None else settings.chunk_overlap_chars
    overlap = max(0, min(overlap, target // 2))

    if not pages:
        return []

    # Build one continuous string plus an offset -> page map.
    parts: list[str] = []
    offsets: list[int] = []  # offsets[i] = start offset of pages[i]
    pos = 0
    for p in pages:
        offsets.append(pos)
        parts.append(p.text)
        pos += len(p.text)
    full = "".join(parts)
    starts = offsets
    page_numbers = [p.page for p in pages]

    def page_at(index: int) -> int | None:
        i = bisect_right(starts, index) - 1
        if i < 0:
            return None
        return page_numbers[i]

    chunks: list[Chunk] = []
    n = len(full)
    if n == 0:
        return chunks

    start = 0
    position = 0
    while start < n:
        hard_end = min(start + target, n)
        min_end = start + max(target // 2, 200)
        if min_end >= n:
            min_end = hard_end
        end = _find_boundary(full, start, hard_end, min(min_end, hard_end))
        if end <= start:
            end = hard_end
        raw = full[start:end].strip()
        if raw:
            chunks.append(
                Chunk(
                    content=raw,
                    page=page_at(start),
                    position=position,
                    token_count=estimate_tokens(raw),
                )
            )
            position += 1
        if end >= n:
            break
        next_start = max(end - overlap, start + 1)
        # avoid starting mid-word
        while next_start < n and full[next_start - 1] not in _SENTENCE_ENDINGS and full[next_start] != " ":
            if full[next_start] == "\n" or full[next_start] in ".!?":
                break
            if next_start >= end:
                break
            next_start += 1
        start = next_start
    return chunks


def chunk_plain_text(text: str, *, page: int | None = None) -> list[Chunk]:
    return chunk_pages([PageText(page=page, text=text)])

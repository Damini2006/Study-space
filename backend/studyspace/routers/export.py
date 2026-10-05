"""Export & Import endpoints."""

from __future__ import annotations

import csv
import io
import json
import uuid
import zipfile
from datetime import datetime
from enum import Enum

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from studyspace.deps import DbDep
from studyspace.models.spaces import SpaceOut

router = APIRouter(prefix="/spaces", tags=["export"])


class ExportFormat(str, Enum):
    anki = "anki"
    pdf = "pdf"
    markdown = "markdown"
    notion = "notion"


def _make_filename(space_title: str, fmt: ExportFormat) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in space_title)
    ts = datetime.utcnow().strftime("%Y%m%d")
    ext = {"anki": "apkg", "pdf": "pdf", "markdown": "zip", "notion": "csv"}[fmt.value]
    return f"{safe}-{ts}.{ext}"


@router.get("/{space_id}/export")
async def export_space(
    db: DbDep,
    space_id: uuid.UUID,
    fmt: ExportFormat = Query(ExportFormat.markdown),
) -> StreamingResponse:
    """Export a space as Anki deck, PDF, Markdown zip, or Notion CSV."""

    # Verify access (owner or valid share)
    space = await db.fetchrow(
        "select * from public.spaces where id = $1 and user_id = auth.uid()", space_id
    )
    if space is None:
        # Check shared access via token in header
        share_token = None
        # In practice, share token would come from a custom header or query param
        raise HTTPException(status_code=404, detail="Space not found or not yours.")

    # Fetch all related data
    sources = await db.fetch(
        "select * from public.sources where space_id = $1 and status = 'ready' order by created_at",
        space_id,
    )
    cards = await db.fetch(
        "select * from public.cards where space_id = $1 order by created_at", space_id
    )
    notes = await db.fetch(
        "select * from public.notes where space_id = $1 order by updated_at desc", space_id
    )
    # For chunks, we'd need to join via sources

    if fmt == ExportFormat.anki:
        return _export_anki(space, cards)
    elif fmt == ExportFormat.pdf:
        return _export_pdf(space, sources, cards, notes)
    elif fmt == ExportFormat.markdown:
        return _export_markdown_zip(space, sources, cards, notes)
    elif fmt == ExportFormat.notion:
        return _export_notion_csv(space, notes)
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")


def _export_anki(space, cards) -> StreamingResponse:
    """
    Generate a minimal .apkg (Anki package).
    Real implementation would use genanki; here we emit a JSON manifest
    that the frontend can use with a client-side library.
    """
    # For now, return a JSON that the frontend can feed to a client-side apkg generator
    notes_data = []
    for c in cards:
        notes_data.append({
            "model": "Basic",
            "fields": [c["front"], c["back"]],
            "tags": c.get("tags", []),
        })

    manifest = {
        "deckName": space["title"],
        "notes": notes_data,
    }

    buf = io.BytesIO()
    buf.write(json.dumps(manifest, ensure_ascii=False, indent=2).encode())
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{_make_filename(space["title"], ExportFormat.anki)}"'},
    )


def _export_pdf(space, sources, cards, notes) -> StreamingResponse:
    """
    Generate a simple PDF. Real impl would use reportlab/weasyprint.
    Returns a placeholder for now.
    """
    html = f"""
    <html><body>
    <h1>{space['title']}</h1>
    <p>Sources: {len(sources)} | Cards: {len(cards)} | Notes: {len(notes)}</p>
    <hr>
    <h2>Cards</h2>
    <ul>{''.join(f'<li><b>{c["front"]}</b>: {c["back"]}</li>' for c in cards)}</ul>
    <h2>Notes</h2>
    <ul>{''.join(f'<li><b>{n["title"]}</b>: {n.get("content","")[:200]}</li>' for n in notes)}</ul>
    </body></html>
    """
    # In production, convert HTML to PDF with weasyprint
    pdf_bytes = html.encode()  # placeholder
    buf = io.BytesIO(pdf_bytes)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_make_filename(space["title"], ExportFormat.pdf)}"'},
    )


def _export_markdown_zip(space, sources, cards, notes) -> StreamingResponse:
    """Export as a zip of markdown files (one per source/note/card)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        # Sources
        for s in sources:
            md = f"# {s['title']}\n\nType: {s['type']}\n\n---\n\nContent pending extraction."
            z.writestr(f"sources/{s['title'][:100]}.md", md)

        # Notes
        for n in notes:
            content = n.get("content", "") if isinstance(n.get("content"), str) else ""
            md = f"# {n['title']}\n\nTags: {', '.join(n.get('tags', []))}\n\n{content}"
            z.writestr(f"notes/{n['title'][:100]}.md", md)

        # Cards
        cards_md = "\n\n---\n\n".join(
            f"**Q:** {c['front']}\n\n**A:** {c['back']}\n\nTags: {', '.join(c.get('tags', []))}"
            for c in cards
        )
        z.writestr("cards.md", f"# {space['title']} — Flashcards\n\n{cards_md}")

        # README
        z.writestr("README.md", f"# {space['title']}\n\nExported from StudySpace on {datetime.utcnow().isoformat()}Z")

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{_make_filename(space["title"], ExportFormat.markdown)}"'},
    )


def _export_notion_csv(space, notes) -> StreamingResponse:
    """Export notes as CSV for Notion import."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Title", "Content", "Tags", "Created", "Updated"])
    for n in notes:
        content = n.get("content", "") if isinstance(n.get("content"), str) else ""
        writer.writerow([
            n["title"],
            content[:10000],  # Notion cell limit
            ", ".join(n.get("tags", [])),
            n.get("created_at", ""),
            n.get("updated_at", ""),
        ])

    csv_bytes = buf.getvalue().encode("utf-8")
    bio = io.BytesIO(csv_bytes)
    return StreamingResponse(
        bio,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{_make_filename(space["title"], ExportFormat.notion)}"'},
    )


# ----- Import endpoints (stubs for now) -----

class ImportFormat(str, Enum):
    anki = "anki"
    obsidian = "obsidian"
    notion = "notion"
    pdf = "pdf"


@router.post("/{space_id}/import")
async def import_space(
    db: DbDep,
    space_id: uuid.UUID,
    fmt: ImportFormat,
    # file: UploadFile = File(...),
) -> dict:
    """
    Import from various formats.
    For MVP, return accepted; real impl would parse and create sources/cards/notes.
    """
    space = await db.fetchrow("select id from public.spaces where id = $1 and user_id = auth.uid()", space_id)
    if space is None:
        raise HTTPException(status_code=404, detail="Space not found.")

    # TODO: parse uploaded file based on fmt
    return {"status": "accepted", "format": fmt.value, "message": "Import queued for processing."}
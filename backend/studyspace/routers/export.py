"""Export & Import endpoints."""

from __future__ import annotations

import csv
import io
import uuid
import zipfile
from datetime import datetime
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from studyspace.config import get_settings
from studyspace.deps import DbDep
from studyspace.models.export import ImportSummary
from studyspace.queue import enqueue_ingest
from studyspace.rate_limit import rate_limit
from studyspace.security import sanitize_filename
from studyspace.services.export_formats import build_apkg, build_print_html
from studyspace.services.import_formats import (
    MAX_IMPORT_FILES,
    BundleError,
    PdfDoc,
    parse_uploads,
)
from studyspace.services.source_intake import (
    QuotaReached,
    StorageUploadError,
    check_quota,
    create_source,
    upload_to_storage,
)

router = APIRouter(prefix="/spaces", tags=["export"])


class ExportFormat(str, Enum):
    anki = "anki"
    pdf = "pdf"
    markdown = "markdown"
    notion = "notion"


def _make_filename(space_title: str, fmt: ExportFormat) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in space_title)
    ts = datetime.utcnow().strftime("%Y%m%d")
    # pdf downloads as .html: the print page is HTML and says so.
    ext = {"anki": "apkg", "pdf": "html", "markdown": "zip", "notion": "csv"}[fmt.value]
    return f"{safe}-{ts}.{ext}"


@router.get("/{space_id}/export")
async def export_space(
    db: DbDep,
    space_id: uuid.UUID,
    fmt: Annotated[ExportFormat, Query()] = ExportFormat.markdown,
    auto_print: Annotated[bool, Query(alias="print")] = False,
) -> StreamingResponse:
    """Export a space as an Anki deck, print page, Markdown zip, or Notion CSV.

    ``print`` (fmt=pdf only) makes the page open its print dialog on load.
    """

    # Verify access (owner or valid share)
    space = await db.fetchrow(
        "select * from public.spaces where id = $1 and user_id = auth.uid()", space_id
    )
    if space is None:
        # Shared access via token is not wired up yet: in practice it would come
        # from a custom header or query param, and fall through here if absent.
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

    if fmt == ExportFormat.anki:
        return _export_anki(space, cards)
    elif fmt == ExportFormat.pdf:
        return _export_pdf(space, sources, cards, notes, auto_print=auto_print)
    elif fmt == ExportFormat.markdown:
        chunks = await db.fetch(
            "select source_id, content from public.chunks "
            "where space_id = $1 order by source_id, position",
            space_id,
        )
        return _export_markdown_zip(space, sources, cards, notes, chunks)
    elif fmt == ExportFormat.notion:
        return _export_notion_csv(space, notes)
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")


def _export_anki(space, cards) -> StreamingResponse:
    """A real .apkg: zip wrapping a standard Anki collection.

    Built by services/export_formats.py; round-tripped through our own
    import parser in tests/test_export_anki.py.
    """
    triples = [(c["front"], c["back"], c.get("tags") or []) for c in cards]
    data = build_apkg(space["title"], triples)

    buf = io.BytesIO(data)
    return StreamingResponse(
        buf,
        # It is literally a zip; .apkg is Anki's extension for one.
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{_make_filename(space["title"], ExportFormat.anki)}"'},
    )


def _export_pdf(space, sources, cards, notes, *, auto_print: bool) -> StreamingResponse:
    """The "PDF" export is an honest print page.

    The browser makes the actual file (print -> Save as PDF), so we
    serve text/html with an .html name instead of HTML wearing a .pdf.
    ``auto_print`` opens the print dialog on load for the dialog flow.
    """
    page = build_print_html(
        space["title"], sources, cards, notes, auto_print=auto_print
    )
    buf = io.BytesIO(page.encode("utf-8"))
    return StreamingResponse(
        buf,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{_make_filename(space["title"], ExportFormat.pdf)}"'},
    )


def _unique_entry(prefix: str, title: str, taken: set[str]) -> str:
    """A zip entry name that can't escape the archive and can't collide.

    Titles are user input: they can contain path segments ("../"), and
    two notes can share a title - without a counter the second would
    overwrite the first on extraction.
    """
    base = sanitize_filename(title)
    if base.lower().endswith(".md"):
        base = base[: -len(".md")]
    entry = f"{prefix}/{base}.md"
    counter = 2
    while entry in taken:
        entry = f"{prefix}/{base} ({counter}).md"
        counter += 1
    taken.add(entry)
    return entry


def _export_markdown_zip(space, sources, cards, notes, chunks) -> StreamingResponse:
    """Export as a zip of markdown files (one per source/note/card).

    Source files carry the text the worker extracted (the chunk rows, in
    order); note files carry content_text - the jsonb `content` column is
    a document, not text.
    """
    by_source: dict = {}
    for ch in chunks:
        by_source.setdefault(ch["source_id"], []).append(ch["content"])

    taken: set[str] = set()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for s in sources:
            parts = by_source.get(s["id"], [])
            body = "\n\n".join(parts) if parts else "(no extracted text)"
            md = f"# {s['title']}\n\nType: {s['type']}\n\n---\n\n{body}"
            z.writestr(_unique_entry("sources", s["title"], taken), md)

        for n in notes:
            content = n.get("content_text") or ""
            md = f"# {n['title']}\n\nTags: {', '.join(n.get('tags') or [])}\n\n{content}"
            z.writestr(_unique_entry("notes", n["title"], taken), md)

        cards_md = "\n\n---\n\n".join(
            f"**Q:** {c['front']}\n\n**A:** {c['back']}\n\nTags: {', '.join(c.get('tags') or [])}"
            for c in cards
        )
        z.writestr("cards.md", f"# {space['title']} — Flashcards\n\n{cards_md}")

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
        # content_text is the plain text; the jsonb `content` never renders.
        content = (n.get("content_text") or "")[:10000]
        writer.writerow([
            n["title"],
            content,  # Notion cell limit
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


# ----- Import -----

class ImportFormat(str, Enum):
    anki = "anki"
    obsidian = "obsidian"
    notion = "notion"
    pdf = "pdf"


@router.post("/{space_id}/import", response_model=ImportSummary, status_code=201)
async def import_space(
    request: Request,
    db: DbDep,
    space_id: uuid.UUID,
    fmt: Annotated[ImportFormat, Query()],
    files: Annotated[list[UploadFile], File()],
) -> ImportSummary:
    """Import files into the space, synchronously, in this request.

    Documents (pdf/md/csv) go to storage and the ingestion queue exactly like
    a manual upload; Anki cards land in the study queue immediately. All rows
    are written inside this request's transaction, so any failure rolls the
    whole import back - a partial import never survives. Storage objects
    written before a rollback are orphaned (as in the upload endpoint) and
    cleaned up by bucket lifecycle rules.
    """
    settings = get_settings()
    user = request.state.verified_user
    rl = await rate_limit(f"upload:{user.id}", settings.rate_limit_upload_per_5min, 300)
    if not rl.allowed:
        raise HTTPException(status_code=429, detail="Upload limit reached. Try again in a few minutes.")

    space = await db.fetchrow(
        "select id from public.spaces where id = $1 and user_id = auth.uid()", space_id
    )
    if space is None:
        raise HTTPException(status_code=404, detail="Space not found.")
    try:
        await check_quota(user.id)
    except QuotaReached as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc

    if len(files) > MAX_IMPORT_FILES:
        raise HTTPException(
            status_code=400, detail=f"One import accepts at most {MAX_IMPORT_FILES} files."
        )
    max_bytes = settings.max_upload_mb * 1024 * 1024
    uploads: list[tuple[str, bytes]] = []
    for file in files:
        safe_name = sanitize_filename(file.filename or "upload")
        data = await file.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"'{safe_name}' is larger than the {settings.max_upload_mb} MB limit.",
            )
        uploads.append((safe_name, data))

    try:
        bundle = parse_uploads(fmt.value, uploads)
    except BundleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Order matters: storage objects first (they need the source id), then
    # rows, then cards, and only then jobs - the worker reads rows, so no
    # job may exist for a row that does not (yet) exist.
    token = request.headers.get("authorization", "").split(" ", 1)[-1]
    pending_jobs: list[dict] = []
    for doc in bundle.docs:
        source_id = uuid.uuid4()
        if isinstance(doc, PdfDoc):
            payload, file_type, title, pasted = doc.data, "pdf", doc.filename, None
        else:
            payload = doc.text.encode("utf-8")
            file_type, title, pasted = doc.file_type, doc.title, doc.text
        try:
            storage_path = await upload_to_storage(
                token=token, user_id=user.id, space_id=space_id,
                source_id=source_id, filename=doc.filename, data=payload,
            )
        except StorageUploadError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        row_id = await create_source(
            db, user_id=user.id, space_id=space_id, file_type=file_type,
            title=title, storage_path=storage_path, size_bytes=len(payload),
        )
        pending_jobs.append(
            {
                "row_id": row_id, "storage_path": storage_path,
                "file_type": file_type, "title": title, "pasted_text": pasted,
            }
        )

    for card in bundle.cards:
        card_id = await db.fetchval(
            "insert into public.cards (user_id, space_id, front, back, tags) "
            "values ($1, $2, $3, $4, $5) returning id",
            user.id, space_id, card.front, card.back, list(card.tags),
        )
        # Due immediately, mirroring what studio-generated cards do.
        await db.execute(
            "insert into public.card_state (user_id, card_id, due) values ($1, $2, now())",
            user.id, card_id,
        )

    for job in pending_jobs:
        try:
            await enqueue_ingest(
                source_id=job["row_id"], user_id=user.id, space_id=space_id,
                storage_path=job["storage_path"], file_type=job["file_type"],
                title=job["title"], pasted_text=job["pasted_text"],
            )
        except Exception as exc:
            # The 503 rolls back every row above; there is no partial import.
            raise HTTPException(
                status_code=503, detail="Job queue unavailable. Please retry shortly."
            ) from exc

    return ImportSummary(
        format=fmt.value,
        sources=len(bundle.docs),
        cards=len(bundle.cards),
        skipped=bundle.skipped,
        warnings=bundle.warnings,
    )
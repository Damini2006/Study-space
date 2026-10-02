"""ARQ background worker for StudySpace ingestion pipeline."""

from __future__ import annotations

import asyncio
import io
import json
import os
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Optional

import httpx
import pdfplumber
from arq import ArqRedis, cron
from arq.connections import RedisSettings
from docx import Document
from pypdf import PdfReader

from studyspace.config import get_settings
from studyspace.db_service import service_conn
from studyspace.security import SOURCE_UNTRUSTED_MARKER, wrap_untrusted
from studyspace.services.chunking import PageText, chunk_pages
from studyspace.services.embeddings import embed_texts
from studyspace.tracing import span as trace_span

settings = get_settings()


@dataclass
class IngestJob:
    source_id: str
    user_id: str
    space_id: str
    storage_path: Optional[str]
    file_type: str
    title: str
    pasted_text: Optional[str] = None


async def download_from_storage(storage_path: str, token: str) -> bytes:
    """Download file bytes from Supabase Storage."""
    url = f"{settings.storage_base}/object/sources/{storage_path}"
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
        )
        resp.raise_for_status()
        return resp.content


def extract_text_pdf(data: bytes) -> list[PageText]:
    """Extract text with page numbers from PDF using pypdf."""
    reader = PdfReader(io.BytesIO(data))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(PageText(page=i, text=text))
    return pages


def extract_text_pdfplumber(data: bytes) -> list[PageText]:
    """Extract text with pdfplumber (more robust for complex PDFs)."""
    pages = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append(PageText(page=i, text=text))
    return pages


def extract_text_docx(data: bytes) -> list[PageText]:
    """Extract text from DOCX."""
    doc = Document(io.BytesIO(data))
    full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return [PageText(page=1, text=full_text)] if full_text else []


def extract_text_plain(data: bytes) -> list[PageText]:
    """Extract text from plain text / markdown."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
    return [PageText(page=1, text=text)]


async def ingest_source(
    ctx: dict,
    source_id: str,
    user_id: str,
    space_id: str,
    storage_path: Optional[str],
    file_type: str,
    title: str,
    pasted_text: Optional[str] = None,
) -> None:
    """Main ingestion job: extract → chunk → embed → store."""
    settings = get_settings()

    with trace_span("worker.ingest", metadata={"source_id": source_id}) as sp:
        # Update status to processing
        async with service_conn() as conn:
            await conn.execute(
                "update public.sources set status = 'processing' where id = $1", source_id
            )

        try:
            # Get raw text
            if pasted_text is not None:
                pages = [PageText(page=1, text=pasted_text)]
            elif storage_path:
                # Download from storage using a service token
                # The worker uses its own Supabase access (service role)
                # For simplicity, we'll use the anon key with a service token if available
                service_token = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
                data = await download_from_storage(storage_path, service_token)

                if file_type == "pdf":
                    pages = extract_text_pdfplumber(data)
                elif file_type == "docx":
                    pages = extract_text_docx(data)
                else:
                    pages = extract_text_plain(data)
            else:
                raise ValueError("No storage path or pasted text provided")

            if not pages:
                raise ValueError("No extractable text found")

            # Chunk
            chunks = chunk_pages(
                pages,
                target_chars=settings.chunk_target_chars,
                overlap_chars=settings.chunk_overlap_chars,
            )
            if not chunks:
                raise ValueError("Chunking produced no chunks")

            # Embed in batches
            texts = [c.content for c in chunks]
            embeddings = await embed_texts(texts)

            # Store chunks + embeddings
            async with service_conn() as conn:
                # Delete any existing chunks for this source (re-ingestion)
                await conn.execute(
                    "delete from public.chunks where source_id = $1", source_id
                )

                # Insert new chunks
                for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                    vec_literal = "[" + ",".join(f"{float(v):.6f}" for v in emb) + "]"
                    await conn.execute(
                        "insert into public.chunks "
                        "(source_id, space_id, content, position, page, token_count, embedding) "
                        "values ($1, $2, $3, $4, $5, $6, $7::vector)",
                        source_id,
                        space_id,
                        chunk.content,
                        i,
                        chunk.page,
                        chunk.token_count,
                        vec_literal,
                    )

                # Update source status
                char_count = sum(len(c.content) for c in chunks)
                await conn.execute(
                    "update public.sources set status = 'ready', char_count = $2, "
                    "updated_at = now() where id = $1",
                    source_id,
                    char_count,
                )

            sp.set_output({"chunks": len(chunks), "chars": char_count})

        except Exception as exc:
            async with service_conn() as conn:
                await conn.execute(
                    "update public.sources set status = 'failed', error = $2 where id = $1",
                    source_id,
                    str(exc)[:500],
                )
            sp.set_output({"error": str(exc)})
            raise


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [ingest_source]
    cron_jobs = [
        cron(
            "cleanup_failed_ingestions",
            "0 3 * * *",  # daily at 3 AM
            max_tries=1,
        ),
    ]
    max_tries = 3
    job_timeout = 600
    keep_result = 86400


async def cleanup_failed_ingestions(ctx: dict) -> None:
    """Mark sources stuck in 'processing' for more than 1 hour as failed."""
    async with service_conn() as conn:
        await conn.execute(
            "update public.sources set status = 'failed', error = 'Timed out' "
            "where status = 'processing' and updated_at < now() - interval '1 hour'"
        )
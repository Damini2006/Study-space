"""Studio: generate summaries, study guides, flashcards and MCQ quizzes from
selected sources — every output carries source citations, is saved, editable,
and generated flashcards flow straight into the FSRS review system.
"""

from __future__ import annotations

import json
import re
from typing import Any

import asyncpg

from studyspace.config import get_settings
from studyspace.models.ai_intelligence import RagConfig
from studyspace.models.studio import StudioGenerateRequest, StudioType
from studyspace.security import SOURCE_UNTRUSTED_MARKER, wrap_untrusted
from studyspace.services import llm
from studyspace.services.embeddings import embed_query
from studyspace.services.rag_config import global_rag_config, resolve_rag_config
from studyspace.services.retrieval import Candidate, hybrid_search
from studyspace.tracing import new_trace_id
from studyspace.tracing import span as trace_span

MAX_CONTEXT_CHARS = 24_000  # ~6k tokens of evidence per generation
_CITE_RE = re.compile(r"\[(\d{1,3})\]")


async def _load_context(
    conn: asyncpg.Connection,
    *,
    space_id: str,
    source_ids: list[str],
    topic: str | None,
    want: int = 24,
    config: RagConfig | None = None,
) -> list[Candidate]:
    """Collect evidence: hybrid search when a topic is given, otherwise the
    beginning of each selected source (best for whole-document summaries)."""
    if topic:
        try:
            emb = await embed_query(topic)
            found = await hybrid_search(
                conn,
                query_text=topic,
                query_embedding=emb,
                space_id=space_id,
                source_ids=source_ids or None,
                top_k=want,
                config=config,
            )
            if found:
                return found
        except Exception:
            pass  # fall through to ordered reading

    rows = await conn.fetch(
        "select c.id, c.source_id, s.title as source_title, c.content, c.page "
        "from public.chunks c join public.sources s on s.id = c.source_id "
        "where c.space_id = $1 and ($2::uuid[] is null or c.source_id = any($2)) "
        "order by s.created_at, c.position",
        space_id,
        source_ids or None,
    )
    out: list[Candidate] = []
    total = 0
    for r in rows:
        cand = Candidate(
            chunk_id=str(r["id"]),
            source_id=str(r["source_id"]),
            source_title=r["source_title"],
            content=r["content"],
            page=r["page"],
            final_score=1.0,
        )
        out.append(cand)
        total += len(r["content"])
        if total >= MAX_CONTEXT_CHARS or len(out) >= want * 2:
            break
    for i, c in enumerate(out, start=1):
        c.metadata["label"] = i
    return out


def _context_block(candidates: list[Candidate]) -> str:
    parts = []
    for i, c in enumerate(candidates, start=1):
        loc = f", page {c.page}" if c.page else ""
        parts.append(f"[{i}] Source: {c.source_title}{loc}\n{wrap_untrusted(c.content)}")
    return "\n\n".join(parts) if parts else "(no source text available)"


def _system_prompt(task: str) -> str:
    return (
        f"You are {get_settings().assistant_name}, a study-material writer for students.\n"
        f"Task: {task}\n"
        "Rules:\n"
        "- Use ONLY the numbered passages provided.\n"
        "- Cite supporting passages with [n] ids after factual statements.\n"
        "- Never invent passages, ids or facts.\n"
        f"- {SOURCE_UNTRUSTED_MARKER}\n"
        "- Return only the requested format."
    )


def resolve_labels(text: str, candidates: list[Candidate]) -> list[dict[str, Any]]:
    """Map [n] markers in generated text to real chunk ids (drop invalid n)."""
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for m in _CITE_RE.findall(text):
        n = int(m)
        if n in seen or n < 1 or n > len(candidates):
            continue
        seen.add(n)
        c = candidates[n - 1]
        out.append(
            {
                "label": n,
                "chunk_id": c.chunk_id,
                "source_id": c.source_id,
                "source_title": c.source_title,
                "page": c.page,
            }
        )
    return out


def _strip_invalid(text: str, n: int) -> str:
    return _CITE_RE.sub(lambda m: m.group(0) if int(m.group(1)) <= n else "", text)


# ---------------------------------------------------------------------------
# Generators (each returns the jsonb `content` for studio_outputs)
# ---------------------------------------------------------------------------

async def _generate_summary(
    candidates: list[Candidate],
    topic: str | None,
    count: int,
    config: RagConfig | None = None,
) -> dict[str, Any]:
    # `count` is unused here (a summary has no fixed item count) but keeping the
    # signature uniform means _GENERATORS can be called without per-type branching.
    del count
    cfg = config or global_rag_config()
    messages = [
        {"role": "system", "content": _system_prompt("write a concise markdown study summary")},
        {
            "role": "user",
            "content": (
                (f"Topic focus: {topic}\n\n" if topic else "")
                + f"Passages:\n\n{_context_block(candidates)}\n\n"
                "Write a markdown summary with a short intro, 3-6 key-point sections and a "
                "bullet list of takeaways. Cite passages inline with [n]."
            ),
        },
    ]
    markdown = await llm.chat(
        messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens,
        model=cfg.chat_model,
    )
    markdown = _strip_invalid(markdown, len(candidates))
    return {"markdown": markdown, "citations": resolve_labels(markdown, candidates)}


async def _generate_guide(
    candidates: list[Candidate],
    topic: str | None,
    count: int,
    config: RagConfig | None = None,
) -> dict[str, Any]:
    del count  # a guide's section count comes from the model, not the request
    cfg = config or global_rag_config()
    messages = [
        {"role": "system", "content": _system_prompt("write a structured study guide as JSON")},
        {
            "role": "user",
            "content": (
                (f"Topic focus: {topic}\n\n" if topic else "")
                + f"Passages:\n\n{_context_block(candidates)}\n\n"
                'Return JSON: {"title": str, "sections": [{"heading": str, "body": str, '
                '"citations": [int]}]} with 3-6 sections. "body" is markdown. "citations" '
                "lists the passage numbers that support the section."
            ),
        },
    ]
    data = await llm.chat_json(messages, model=cfg.generate_model or cfg.chat_model)
    sections = []
    for s in (data.get("sections") or [])[:8]:
        labels = [int(x) for x in (s.get("citations") or []) if 1 <= int(x) <= len(candidates)]
        body = _strip_invalid(str(s.get("body", "")), len(candidates))
        sections.append(
            {
                "heading": str(s.get("heading", "Section"))[:200],
                "body": body,
                "citations": resolve_labels(" ".join(f"[{n}]" for n in labels), candidates),
            }
        )
    return {
        "title": str(data.get("title") or topic or "Study guide")[:200],
        "sections": sections,
    }


async def _generate_flashcards(
    candidates: list[Candidate], topic: str | None, count: int, config: RagConfig | None = None
) -> dict[str, Any]:
    cfg = config or global_rag_config()
    messages = [
        {"role": "system", "content": _system_prompt("create flashcards as JSON")},
        {
            "role": "user",
            "content": (
                (f"Topic focus: {topic}\n\n" if topic else "")
                + f"Passages:\n\n{_context_block(candidates)}\n\n"
                f'Create exactly {count} flashcards. Return JSON: {{"cards": [{{"front": str, '
                '"back": str, "tags": [str], "citation": int}]}}. Fronts are specific questions, '
                "backs are short precise answers (1-3 sentences) grounded in one passage."
            ),
        },
    ]
    data = await llm.chat_json(messages, model=cfg.generate_model or cfg.chat_model)
    cards = []
    for c in (data.get("cards") or [])[: count * 2]:
        front = str(c.get("front", "")).strip()
        back = str(c.get("back", "")).strip()
        if not front or not back:
            continue
        label = int(c.get("citation") or 0)
        card: dict[str, Any] = {
            "front": front[:4000],
            "back": back[:8000],
            "tags": [str(t)[:40] for t in (c.get("tags") or [])[:6]],
        }
        if 1 <= label <= len(candidates):
            cand = candidates[label - 1]
            card["source_chunk_id"] = cand.chunk_id
        cards.append(card)
        if len(cards) >= count:
            break
    return {"cards": cards}


async def _generate_quiz(
    candidates: list[Candidate], topic: str | None, count: int, config: RagConfig | None = None
) -> dict[str, Any]:
    cfg = config or global_rag_config()
    messages = [
        {"role": "system", "content": _system_prompt("create a multiple-choice quiz as JSON")},
        {
            "role": "user",
            "content": (
                (f"Topic focus: {topic}\n\n" if topic else "")
                + f"Passages:\n\n{_context_block(candidates)}\n\n"
                f"Create exactly {count} multiple-choice questions (4 options each). Return JSON: "
                '{{"questions": [{{"question": str, "options": [str, str, str, str], '
                '"answer_index": int, "explanation": str, "citation": int}]}}. '
                "answer_index is 0-3. Explanations cite [n] passage numbers."
            ),
        },
    ]
    data = await llm.chat_json(messages, model=cfg.generate_model or cfg.chat_model)
    questions = []
    for q in (data.get("questions") or [])[: count * 2]:
        question = str(q.get("question", "")).strip()
        options = [str(o) for o in (q.get("options") or [])[:4]]
        try:
            answer_index = int(q.get("answer_index"))
        except (TypeError, ValueError):
            continue
        if not question or len(options) != 4 or answer_index not in (0, 1, 2, 3):
            continue
        label = int(q.get("citation") or 0)
        item: dict[str, Any] = {
            "question": question[:2000],
            "options": [o[:400] for o in options],
            "answer_index": answer_index,
            "explanation": _strip_invalid(str(q.get("explanation", "")), len(candidates))[:2000],
        }
        if 1 <= label <= len(candidates):
            cand = candidates[label - 1]
            item["citation"] = {
                "chunk_id": cand.chunk_id,
                "source_id": cand.source_id,
                "source_title": cand.source_title,
                "page": cand.page,
            }
        questions.append(item)
        if len(questions) >= count:
            break
    return {"questions": questions}


_GENERATORS: dict[StudioType, Any] = {
    "summary": _generate_summary,
    "guide": _generate_guide,
    "flashcards": _generate_flashcards,
    "quiz": _generate_quiz,
}

_DEFAULT_COUNTS = {"flashcards": 12, "quiz": 8}


async def generate_studio_output(
    conn: asyncpg.Connection,
    *,
    user_id: str,
    space_id: str,
    request: StudioGenerateRequest,
) -> dict[str, Any]:
    """Generate + persist a studio output; flashcards are also written to FSRS."""
    trace_id = new_trace_id()
    source_ids = [str(s) for s in request.source_ids]
    # Studio honours the same per-space tuning as chat: retrieval weights decide
    # which passages the model sees, and generation knobs decide how it writes.
    cfg = await resolve_rag_config(conn, space_id)

    with trace_span(
        f"studio.{request.type}", user_id=user_id, metadata={"space_id": space_id}
    ) as sp:
        trace_id = sp.trace_id or trace_id
        ready = await conn.fetchval(
            "select count(*) from public.sources where space_id = $1 and status = 'ready' "
            "and ($2::uuid[] is null or id = any($2))",
            space_id,
            source_ids or None,
        )
        if not ready:
            raise ValueError("This Space has no ready sources yet. Upload a document first.")

        candidates = await _load_context(
            conn, space_id=space_id, source_ids=source_ids, topic=request.topic, config=cfg
        )
        if not candidates:
            raise ValueError("No indexed passages found for the selected sources.")

        count = request.count or _DEFAULT_COUNTS.get(request.type, 8)
        generator = _GENERATORS[request.type]
        content = await generator(candidates, request.topic, count, cfg)
        sp.set_output(
            {"type": request.type, "context_chunks": len(candidates), "top_k": cfg.top_k}
        )

        title = (
            request.topic
            or f"{request.type.title()} · {datetime_title()}"
        )
        output_id = await conn.fetchval(
            "insert into public.studio_outputs (user_id, space_id, type, title, content, source_ids, trace_id) "
            "values ($1, $2, $3, $4, $5, $6, $7) returning id",
            user_id, space_id, request.type, title[:200],
            json.dumps(content), source_ids or None, trace_id,
        )

        created_cards = 0
        if request.type == "flashcards":
            created_cards = await _send_cards_to_fsrs(
                conn, user_id=user_id, space_id=space_id,
                output_id=str(output_id), content=content,
            )

        row = await conn.fetchrow(
            "select id, space_id, type, title, content, source_ids, created_at, updated_at "
            "from public.studio_outputs where id = $1",
            output_id,
        )
    result = _output_row(row)
    result["created_cards"] = created_cards
    return result


def datetime_title() -> str:
    from datetime import datetime

    return datetime.now().strftime("%b %d, %Y")


async def _send_cards_to_fsrs(
    conn: asyncpg.Connection,
    *,
    user_id: str,
    space_id: str,
    output_id: str,
    content: dict[str, Any],
) -> int:
    """Insert generated flashcards + initial FSRS state (due immediately)."""
    count = 0
    for card in content.get("cards", []):
        card_id = await conn.fetchval(
            "insert into public.cards (user_id, space_id, source_chunk_id, studio_output_id, front, back, tags, origin) "
            "values ($1, $2, $3, $4, $5, $6, $7, 'ai') returning id",
            user_id, space_id, card.get("source_chunk_id"), output_id,
            card["front"], card["back"], card.get("tags") or [],
        )
        await conn.execute(
            "insert into public.card_state (user_id, card_id, due) values ($1, $2, now())",
            user_id, card_id,
        )
        count += 1
    return count


def _output_row(row: asyncpg.Record) -> dict[str, Any]:
    content = row["content"]
    if isinstance(content, str):
        content = json.loads(content)
    source_ids = row["source_ids"] or []
    return {
        "id": str(row["id"]),
        "space_id": str(row["space_id"]),
        "type": row["type"],
        "title": row["title"],
        "content": content,
        "source_ids": [str(s) for s in source_ids],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }

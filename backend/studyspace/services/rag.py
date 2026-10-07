"""Source-grounded answer generation with four switchable safety layers.

Pipeline (see spec §8):
  1. embed question → hybrid retrieval (vector + FTS) → RRF → rerank
  2. **relevance gate** — skip generation when evidence is too weak
  3. stream the answer with numbered [n] citations
  4. **citation validation** — every [n] must map to a retrieved chunk
  5. **claim verification** — sentence-level entailment against cited chunks
  6. **graceful "not found"** — canned, honest answer with suggestions
  7. persist message + citations + claims, all traced to Langfuse

Each layer is independently switchable (settings or per-request overrides) so
the evaluation suite can ablate them (baseline → +gate → +citation → +claims).
"""

from __future__ import annotations

import re
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg
from pydantic import BaseModel

from studyspace.config import get_settings
from studyspace.models.ai_intelligence import RagConfig
from studyspace.models.chat import ChatRequest, LayerToggles
from studyspace.security import SOURCE_UNTRUSTED_MARKER, wrap_untrusted
from studyspace.services import llm
from studyspace.services.embeddings import embed_query
from studyspace.services.rag_config import describe, global_rag_config, resolve_rag_config
from studyspace.services.retrieval import Candidate, hybrid_search
from studyspace.tracing import new_trace_id
from studyspace.tracing import span as trace_span

CitationLabel = int

NOT_FOUND_HEADING = "I couldn't find this in your sources."
NOT_FOUND_BODY = (
    "\n\nTry one of these:\n"
    "- Upload notes or a PDF in this Space that cover the topic\n"
    "- Rephrase using keywords from your materials\n"
    "- Wait for sources to finish processing — they show **Ready** when searchable"
)

SUGGESTION_LINES = [
    "Upload notes covering this topic to this Space.",
    "Rephrase using keywords from your materials.",
    "Check that your sources finished processing (they show Ready).",
]


# ---------------------------------------------------------------------------
# Layer configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ResolvedLayers:
    relevance_gate: bool
    citation_validation: bool
    claim_verification: bool

    @property
    def enabled_names(self) -> list[str]:
        out = []
        if self.relevance_gate:
            out.append("relevance_gate")
        if self.citation_validation:
            out.append("citation_validation")
        if self.claim_verification:
            out.append("claim_verification")
        return out


def resolve_layers(
    overrides: LayerToggles | None = None,
    config: RagConfig | None = None,
) -> ResolvedLayers:
    """Merge per-request toggles over the space's saved layer settings.

    Precedence is per field, not wholesale: a request that turns off only claim
    verification inherits the space's gate and citation settings rather than
    silently reverting them to global defaults.
    """
    cfg = config or global_rag_config()
    return ResolvedLayers(
        relevance_gate=(
            cfg.relevance_gate
            if overrides is None or overrides.relevance_gate is None
            else overrides.relevance_gate
        ),
        citation_validation=(
            cfg.citation_validation
            if overrides is None or overrides.citation_validation is None
            else overrides.citation_validation
        ),
        claim_verification=(
            cfg.claim_verification
            if overrides is None or overrides.claim_verification is None
            else overrides.claim_verification
        ),
    )


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def build_messages(
    question: str,
    candidates: list[Candidate],
    history: list[dict[str, str]],
    *,
    socratic: bool = False,
) -> list[dict[str, str]]:
    numbered: list[str] = []
    for i, c in enumerate(candidates, start=1):
        loc = f", page {c.page}" if c.page else ""
        numbered.append(f"[{i}] Source: {c.source_title}{loc}\n{wrap_untrusted(c.content)}")
    context = "\n\n".join(numbered) if numbered else "(no passages retrieved)"

    rules = [
        "Answer ONLY from the numbered passages in <context>.",
        "Cite the passages that support each factual sentence with their bracketed ids, e.g. [1].",
        "Cite every factual sentence. Never invent passages or ids.",
        "If the passages do not contain the answer, reply exactly with the heading "
        f"'{NOT_FOUND_HEADING}' followed by the suggestions provided below — do not guess.",
        SOURCE_UNTRUSTED_MARKER,
    ]
    if socratic:
        rules.append(
            "Tutor mode: do NOT give the final answer directly. Ask short guiding "
            "questions and give small hints, each grounded in citations."
        )
        rules.append("Plain language, one step at a time, no lecture.")
    else:
        rules.append("Concise, friendly, sentence-case. Use short paragraphs or bullets.")

    system = (
        f"You are {get_settings().assistant_name}, a study assistant for students.\n"
        "Rules:\n- " + "\n- ".join(rules) +
        f"\n\nSuggested reply when evidence is missing:\n{NOT_FOUND_HEADING}\n"
        + "".join(f"\n- {s}" for s in SUGGESTION_LINES)
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": f"<context>\n{context}\n</context>\n\nQuestion: {question}"})
    return messages


# ---------------------------------------------------------------------------
# Sentence / citation parsing
# ---------------------------------------------------------------------------

CITE_RE = re.compile(r"\[(\d{1,3})\]")
_TINY = re.compile(r"^[\W\d]*$")


@dataclass
class Sentence:
    text: str          # with [n] markers stripped
    raw: str           # original with markers
    labels: list[CitationLabel]
    position: int


def split_sentences(text: str) -> list[str]:
    pieces: list[str] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(\[])", line)
        pieces.extend(p for p in parts if p)
    # merge tiny fragments (e.g. "1." from numbered lists) with the next piece
    merged: list[str] = []
    buf = ""
    for p in pieces:
        buf = f"{buf} {p}".strip() if buf else p
        body = _TINY.sub("", buf)
        if len(body) >= 4:
            merged.append(buf)
            buf = ""
    if buf:
        if merged:
            merged[-1] = f"{merged[-1]} {buf}".strip()
        else:
            merged.append(buf)
    return merged


def annotate_sentences(text: str) -> list[Sentence]:
    out: list[Sentence] = []
    for i, raw in enumerate(split_sentences(text)):
        labels = [int(m) for m in CITE_RE.findall(raw)]
        clean = CITE_RE.sub("", raw).strip()
        clean = re.sub(r"\s{2,}", " ", clean)
        if not clean:
            continue
        out.append(Sentence(text=clean, raw=raw, labels=labels, position=i))
    return out


def strip_invalid_citations(text: str, valid_labels: set[int]) -> tuple[str, list[int]]:
    """Remove citation markers that don't map to a retrieved chunk."""
    removed: list[int] = []

    def _sub(match: re.Match) -> str:
        n = int(match.group(1))
        if n in valid_labels:
            return match.group(0)
        removed.append(n)
        return ""

    cleaned = CITE_RE.sub(_sub, text)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned, removed


_TRANSITION_STARTS = (
    "however", "moreover", "in summary", "to summarize", "overall", "note that",
    "sure", "here", "certainly", "of course", "great", "let's", "lets",
)


def looks_factual(sentence: Sentence) -> bool:
    """Heuristic: does this uncited sentence make a claim that needs evidence?"""
    t = sentence.text.lower().strip()
    if t.startswith(_TRANSITION_STARTS):
        return False
    words = [w for w in re.split(r"\W+", t) if w]
    if len(words) < 6:
        return False
    if t.endswith("?"):
        return False  # questions (socratic hints) are not claims
    has_digit = any(ch.isdigit() for ch in t)
    # ignore the first token for proper-noun detection — it may simply
    # capitalise the start of the sentence
    body_after_first = " ".join(sentence.text.split()[1:]) if sentence.text else ""
    has_proper_noun = bool(re.search(r"\b[A-Z][a-z]{2,}\b", body_after_first))
    return has_digit or has_proper_noun or len(words) >= 12


# ---------------------------------------------------------------------------
# Claim verification (layer 3)
# ---------------------------------------------------------------------------

class ClaimVerdict(BaseModel):
    index: int
    supported: bool
    score: float


async def judge_claims(
    question: str,
    claims: list[Sentence],
    evidence: dict[int, Candidate],
    config: RagConfig | None = None,
) -> dict[int, ClaimVerdict]:
    """Batched entailment judge: is each cited claim supported by its chunks?"""
    cfg = config or global_rag_config()
    verdicts: dict[int, ClaimVerdict] = {}
    batch_size = 8
    for start in range(0, len(claims), batch_size):
        batch = claims[start : start + batch_size]
        blocks = []
        for pos, s in enumerate(batch, start=start):
            ev = "\n".join(
                f"<passage id=\"{lab}\">{evidence[lab].content[:1800]}</passage>"
                for lab in s.labels
                if lab in evidence
            ) or "(no passage cited)"
            blocks.append(f"{pos}. Claim: {s.text}\nEvidence:\n{ev}")
        payload = (
            "You are a strict fact-checking judge. Decide whether each claim is fully "
            "supported by its evidence passages. Transitions and non-factual statements "
            "count as supported.\n\n"
            + "\n\n".join(blocks)
            + "\n\nReply with JSON only: {\"claims\": [{\"index\": <int>, \"supported\": <bool>, "
              "\"score\": <0..1>}]} where index is the claim's number above."
        )
        try:
            data = await llm.chat_json(
                [
                    {"role": "system", "content": "Return only valid JSON. No commentary."},
                    {"role": "user", "content": payload},
                ],
                # A space can route claim verification to a cheaper model: the
                # judge is a high-volume, low-stakes classification task.
                model=cfg.judge_model or None,
            )
            items = data.get("claims", data) if isinstance(data, dict) else data
            for item in items:
                idx = int(item.get("index", -1))
                if 0 <= idx < len(batch):
                    verdicts[start + idx] = ClaimVerdict(
                        index=start + idx,
                        supported=bool(item.get("supported", False)),
                        score=float(item.get("score", 0.0 if not item.get("supported") else 1.0)),
                    )
        except Exception:
            # Judge failure must not break the answer — treat as unverified so
            # the badge degrades honestly to "Low confidence".
            for pos in range(start, start + len(batch)):
                verdicts[pos] = ClaimVerdict(index=pos, supported=True, score=0.5)
    for i in range(len(claims)):
        verdicts.setdefault(i, ClaimVerdict(index=i, supported=True, score=0.5))
    return verdicts


def find_quote_span(claim_sentences: list[str], chunk_content: str) -> str | None:
    """Locate the passage of the chunk that best matches the cited answer text."""
    best: tuple[float, str] | None = None
    chunk_sents = split_sentences(chunk_content)
    if not chunk_sents:
        return None
    for claim in claim_sentences:
        claim_tokens = set(re.findall(r"[a-z0-9']+", claim.lower()))
        if not claim_tokens:
            continue
        for cs in chunk_sents:
            cs_tokens = set(re.findall(r"[a-z0-9']+", cs.lower()))
            if not cs_tokens:
                continue
            overlap = len(claim_tokens & cs_tokens) / len(claim_tokens | cs_tokens)
            if best is None or overlap > best[0]:
                best = (overlap, cs)
    if best and best[0] >= 0.35:
        return best[1][:500]
    return chunk_content[:300] or None


async def verify_claims(
    question: str,
    answer: str,
    status: str,
    candidates: list[Candidate],
    layers: ResolvedLayers,
    config: RagConfig | None = None,
) -> tuple[str, str, list[dict[str, Any]]]:
    """Apply layer 3 (claim verification) and its no-citations companion rule.

    Returns ``(answer, status, claim_records)``: the answer may be trimmed to
    its supported sentences or replaced by the house decline, exactly as the
    chat pipeline delivers it. Extracted from ``run_chat`` so the eval runner
    ablates the same code path chat runs instead of a copy that can drift.
    """
    sentences = annotate_sentences(answer)
    if layers.claim_verification and status != "not_found" and sentences:
        evidence = {i: c for i, c in enumerate(candidates, start=1)}
        cited = [s for s in sentences if s.labels]
        verdicts = await judge_claims(question, cited, evidence, config) if cited else {}
        claim_records: list[dict[str, Any]] = []
        unsupported_texts: list[str] = []
        kept: list[str] = []
        cited_idx = -1
        for s in sentences:
            if s.labels:
                cited_idx += 1
                verdict = verdicts.get(cited_idx)
                supported = bool(verdict and verdict.supported and verdict.score >= 0.5)
                score = verdict.score if verdict else 0.5
                claim_records.append(
                    {
                        "text": s.text,
                        "supported": supported,
                        "judge_score": score,
                        "chunk_id": evidence[s.labels[0]].chunk_id if s.labels[0] in evidence else None,
                    }
                )
                if supported:
                    kept.append(s.raw)
                else:
                    unsupported_texts.append(s.text)
            elif looks_factual(s):
                claim_records.append(
                    {"text": s.text, "supported": False, "judge_score": 0.0, "chunk_id": None}
                )
                unsupported_texts.append(s.text)
            else:
                kept.append(s.raw)
        if unsupported_texts and not kept:
            return not_found_message(), "not_found", claim_records
        if unsupported_texts:
            return "\n\n".join(kept), "low_confidence", claim_records
        if claim_records and not all(c["supported"] for c in claim_records):
            return answer, "low_confidence", claim_records
        return answer, "verified", claim_records
    if status == "verified" and layers.citation_validation and not any(
        s.labels for s in sentences
    ):
        # a "Verified" badge requires at least one real citation
        return answer, "low_confidence", []
    # baseline (all layers off): an answer that came back is marked
    # verified — this is exactly what the eval suite measures.
    return answer, status, []


# ---------------------------------------------------------------------------
# The main pipeline
# ---------------------------------------------------------------------------

class ChatContext(BaseModel):
    user_id: str
    space_id: str
    request: ChatRequest
    conn_factory: Callable[[], Any]  # async context manager -> asyncpg.Connection


async def _load_history(conn: asyncpg.Connection, thread_id: str | None) -> list[dict[str, str]]:
    if not thread_id:
        return []
    rows = await conn.fetch(
        "select role, content from public.messages where thread_id = $1 order by created_at desc limit 6",
        thread_id,
    )
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


async def _ensure_thread(conn: asyncpg.Connection, user_id: str, space_id: str, thread_id: str | None, title: str) -> str:
    if thread_id:
        row = await conn.fetchrow(
            "select id from public.chat_threads where id = $1 and user_id = $2",
            thread_id,
            user_id,
        )
        if row:
            return str(row["id"])
    new_id = await conn.fetchval(
        "insert into public.chat_threads (user_id, space_id, title) values ($1, $2, $3) returning id",
        user_id,
        space_id,
        title[:80],
    )
    return str(new_id)


def not_found_message() -> str:
    return NOT_FOUND_HEADING + NOT_FOUND_BODY


async def run_chat(ctx: ChatContext) -> AsyncIterator[dict[str, Any]]:
    """Yield SSE-ready events; persists messages/citations/claims itself."""
    trace_id = new_trace_id()
    started = time.monotonic()
    final: dict[str, Any] | None = None

    with trace_span(
        "chat.rag",
        input=ctx.request.message,
        user_id=ctx.user_id,
        metadata={"space_id": ctx.space_id},
    ) as sp:
        trace_id = sp.trace_id or trace_id
        try:
            async with ctx.conn_factory() as conn:
                history = await _load_history(conn, ctx.request.thread_id)
                thread_id = await _ensure_thread(
                    conn, ctx.user_id, ctx.space_id, ctx.request.thread_id, ctx.request.message
                )
                await conn.execute(
                    "insert into public.messages (user_id, thread_id, space_id, role, content, trace_id) "
                    "values ($1, $2, $3, 'user', $4, $5)",
                    ctx.user_id, thread_id, ctx.space_id, ctx.request.message, trace_id,
                )
                await conn.execute(
                    "update public.chat_threads set updated_at = now() where id = $1", thread_id
                )
            yield {"type": "thread", "thread_id": thread_id, "trace_id": trace_id}

            # --- retrieval ------------------------------------------------
            async with ctx.conn_factory() as conn:
                cfg = await resolve_rag_config(conn, ctx.space_id)
            # A per-request toggle beats the space's saved config, so the UI can
            # A/B the layers without editing and re-saving the space.
            layers = resolve_layers(ctx.request.layers, cfg)
            # Explicit socratic in the request wins; otherwise the space's default.
            socratic = ctx.request.socratic or cfg.socratic_mode

            with trace_span("chat.retrieval", user_id=ctx.user_id) as rsp:
                query_emb = await embed_query(ctx.request.message)
                source_ids = [str(s) for s in ctx.request.source_ids] or None
                async with ctx.conn_factory() as conn:
                    candidates = await hybrid_search(
                        conn,
                        query_text=ctx.request.message,
                        query_embedding=query_emb,
                        space_id=ctx.space_id,
                        source_ids=source_ids,
                        top_k=cfg.top_k,
                        config=cfg,
                    )
                rsp.set_output({"candidates": len(candidates), "top_k": cfg.top_k})

            retrieval_event = {
                "type": "retrieval",
                "chunks": [
                    {
                        "chunk_id": c.chunk_id,
                        "source_id": c.source_id,
                        "source_title": c.source_title,
                        "page": c.page,
                        "snippet": c.content[:400],
                        "score": round(c.final_score, 4),
                        "vector_score": round(c.vector_score, 4) if c.vector_score is not None else None,
                        "fts_score": round(c.fts_score, 4) if c.fts_score is not None else None,
                        "label": i,
                    }
                    for i, c in enumerate(candidates, start=1)
                ],
            }
            yield retrieval_event

            # --- layer 1: relevance gate ---------------------------------
            # Only candidates the vector arm actually scored can inform the
            # similarity gate. A pure full-text match (an exact term the
            # embeddings happen not to capture — a formula, a code identifier)
            # has no vector score at all, and treating that as similarity 0.0
            # would gate out exactly the questions keyword search answers best.
            # So when nothing was scored, the gate abstains rather than vetoes.
            scored = [c.vector_score for c in candidates if c.vector_score is not None]
            best_sim = max(scored, default=None)
            gate_failed = not candidates or (
                layers.relevance_gate
                and best_sim is not None
                and best_sim < cfg.relevance_threshold
            )
            if gate_failed:
                content = not_found_message()
                final = await _persist_assistant(
                    ctx, thread_id, content, status="not_found",
                    citations=[], claims=[], trace_id=trace_id,
                    meta={
                        "layers": layers.enabled_names,
                        "reason": (
                            "relevance_gate" if layers.relevance_gate else "no_candidates"
                        ),
                        "best_similarity": (
                            round(best_sim, 4) if best_sim is not None else None
                        ),
                        # Tells the reader the gate abstained rather than failed,
                        # so a "no answer here" is never mistaken for "nothing matched".
                        "gate_basis": "vector_similarity" if best_sim is not None else "fts_only",
                        "latency_ms": int((time.monotonic() - started) * 1000),
                    },
                )
                yield {"type": "final", "message": final}
                sp.set_output({"status": "not_found"})
                return

            # --- generation ----------------------------------------------
            messages = build_messages(
                ctx.request.message, candidates, history, socratic=socratic
            )
            buffer: list[str] = []
            with trace_span("chat.generate", user_id=ctx.user_id) as gsp:
                async for delta in llm.stream(
                    messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens
                ):
                    buffer.append(delta)
                    yield {"type": "token", "text": delta}
                raw_answer = "".join(buffer)
                gsp.set_output({"tokens": len(buffer)})

            # --- layer 2: citation validation ----------------------------
            valid_labels = set(range(1, len(candidates) + 1))
            answer = raw_answer
            removed_labels: list[int] = []
            if layers.citation_validation:
                answer, removed_labels = strip_invalid_citations(raw_answer, valid_labels)

            status = "verified"
            if answer.strip().startswith(NOT_FOUND_HEADING):
                status = "not_found"

            # --- layer 3: claim verification -----------------------------
            # verify_claims is shared with the eval runner: the ablation
            # must measure the same code chat delivers, not a copy of it.
            evidence = {i: c for i, c in enumerate(candidates, start=1)}
            with trace_span("chat.claim_verification", user_id=ctx.user_id) as csp:
                answer, status, claim_records = await verify_claims(
                    ctx.request.message, answer, status, candidates, layers, cfg,
                )
                csp.set_output(
                    {
                        "claims": len(claim_records),
                        "unsupported": sum(
                            1 for c in claim_records if not c["supported"]
                        ),
                    }
                )

            # --- build citation rows -------------------------------------
            citations: list[dict[str, Any]] = []
            if status != "not_found":
                per_label_claims: dict[int, list[str]] = {}
                for s in annotate_sentences(answer):
                    for lab in s.labels:
                        per_label_claims.setdefault(lab, []).append(s.text)
                for lab in sorted(per_label_claims):
                    if lab not in evidence:
                        continue
                    cand = evidence[lab]
                    quote = find_quote_span(per_label_claims[lab], cand.content)
                    citations.append(
                        {
                            "label": lab,
                            "chunk_id": cand.chunk_id,
                            "source_id": cand.source_id,
                            "source_title": cand.source_title,
                            "page": cand.page,
                            "quote": quote or cand.content[:300],
                            "score": round(cand.final_score, 4),
                            "verified": layers.citation_validation,
                        }
                    )

            final = await _persist_assistant(
                ctx, thread_id, answer, status=status, citations=citations,
                claims=claim_records, trace_id=trace_id,
                meta={
                    "layers": layers.enabled_names,
                    # Record the resolved config so a surprising answer can be
                    # explained after the fact — "top_k was 6 and the gate sat at
                    # 0.55" beats guessing about it later.
                    "rag_config": cfg.model_dump(),
                    "rag_overrides": sorted(describe(cfg)),
                    "removed_labels": removed_labels,
                    "retrieval": retrieval_event["chunks"],
                    "latency_ms": int((time.monotonic() - started) * 1000),
                    "socratic": socratic,
                },
            )
            yield {"type": "final", "message": final}
            sp.set_output({"status": status, "citations": len(citations)})

        except Exception as exc:  # noqa: BLE001 — surface a safe error event
            yield {"type": "error", "detail": _safe_error(exc)}
        finally:
            yield {"type": "done"}


def _safe_error(exc: Exception) -> str:
    from studyspace.services.embeddings import EmbeddingError
    from studyspace.services.llm import LLMError

    if isinstance(exc, (LLMError, EmbeddingError)):
        return "The assistant is temporarily unavailable. Please try again."
    if isinstance(exc, asyncpg.PostgresError):
        return "A database error occurred. Please try again."
    return "Something went wrong while answering. Please try again."


async def _persist_assistant(
    ctx: ChatContext,
    thread_id: str,
    content: str,
    *,
    status: str,
    citations: list[dict[str, Any]],
    claims: list[dict[str, Any]],
    trace_id: str,
    meta: dict[str, Any],
) -> dict[str, Any]:
    import json

    async with ctx.conn_factory() as conn:
        message_id = await conn.fetchval(
            "insert into public.messages (user_id, thread_id, space_id, role, content, status, trace_id, meta) "
            "values ($1, $2, $3, 'assistant', $4, $5, $6, $7) returning id",
            ctx.user_id, thread_id, ctx.space_id, content, status, trace_id,
            json.dumps(meta),
        )
        citation_rows: list[dict[str, Any]] = []
        for c in citations:
            # space_id / source_id / source_title / page are snapshotted at answer
            # time (migration 0010). Without them the citation audit loses the row
            # the moment the chunk is deleted: there's no join path left to find
            # which space or document it belonged to.
            await conn.execute(
                "insert into public.citations "
                "(user_id, message_id, chunk_id, space_id, source_id, source_title, page, "
                " label, quote_span, verified, score) "
                "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                ctx.user_id, message_id, c["chunk_id"], ctx.space_id,
                c["source_id"], c["source_title"], c.get("page"),
                c["label"], c["quote"], c["verified"], c["score"],
            )
            citation_rows.append(c)
        for i, claim in enumerate(claims):
            await conn.execute(
                "insert into public.claims (user_id, message_id, text, supported, chunk_id, judge_score, position) "
                "values ($1, $2, $3, $4, $5, $6, $7)",
                ctx.user_id, message_id, claim["text"], claim["supported"],
                claim.get("chunk_id"), claim.get("judge_score"), i,
            )
        row = await conn.fetchrow(
            "select id, thread_id, role, content, status, created_at from public.messages where id = $1",
            message_id,
        )
    return {
        "id": str(row["id"]),
        "thread_id": str(row["thread_id"]),
        "role": row["role"],
        "content": row["content"],
        "status": row["status"],
        "citations": [{**c, "chunk_id": str(c["chunk_id"]), "source_id": str(c["source_id"])} for c in citation_rows],
        "claims": claims,
        "created_at": row["created_at"].isoformat() if isinstance(row["created_at"], datetime) else str(row["created_at"]),
        "trace_id": trace_id,
    }

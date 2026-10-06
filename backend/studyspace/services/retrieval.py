"""Hybrid retrieval: pgvector similarity + Postgres full-text → Reciprocal
Rank Fusion → reranking.

The SQL does the cheap candidate generation, Python does RRF + reranking so
the fusion logic is unit-testable without a database.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Sequence

import asyncpg

from studyspace.config import get_settings
from studyspace.models.ai_intelligence import RagConfig
from studyspace.services.rag_config import global_rag_config

_WORD_RE = re.compile(r"[a-z0-9']+")


@dataclass
class Candidate:
    chunk_id: str
    source_id: str
    source_title: str
    content: str
    page: int | None
    vector_rank: int | None = None
    fts_rank: int | None = None
    vector_score: float | None = None  # cosine similarity (higher = closer)
    fts_score: float | None = None
    fused_score: float = 0.0
    rerank_score: float | None = None
    final_score: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# SQL candidate generation
# ---------------------------------------------------------------------------

_CANDIDATE_SQL = """
with vec as (
  select c.id, c.source_id, s.title as source_title, c.content, c.page,
         1 - (c.embedding <=> $1::vector) as sim,
         row_number() over (order by c.embedding <=> $1::vector) as r
  from public.chunks c
  join public.sources s on s.id = c.source_id
  where c.space_id = $2
    and c.embedding is not null
    and ($3::uuid[] is null or c.source_id = any($3))
  order by c.embedding <=> $1::vector
  limit $4
),
fts as (
  select c.id, c.source_id, s.title as source_title, c.content, c.page,
         ts_rank(c.tsv, q.query) as rank_score,
         row_number() over (order by ts_rank(c.tsv, q.query) desc, c.id) as r
  from public.chunks c
  join public.sources s on s.id = c.source_id,
       plainto_tsquery('english', $5) as q
  where c.space_id = $2
    and c.tsv @@ q
    and ($3::uuid[] is null or c.source_id = any($3))
  order by ts_rank(c.tsv, q.query) desc
  limit $6
),
fused as (
  select
    coalesce(v.id, f.id) as id,
    coalesce(v.source_id, f.source_id) as source_id,
    coalesce(v.source_title, f.source_title) as source_title,
    coalesce(v.content, f.content) as content,
    coalesce(v.page, f.page) as page,
    v.sim as vector_score,
    f.rank_score as fts_score,
    v.r as vector_rank,
    f.r as fts_rank
  from vec v
  full outer join fts f on v.id = f.id
)
select id, source_id, source_title, content, page, vector_score, fts_score,
       vector_rank, fts_rank,
       coalesce($7::float8 / ($9 + vector_rank), 0) +
       coalesce($8::float8 / ($9 + fts_rank), 0) as fused_score
from fused
order by fused_score desc, coalesce(vector_rank, 9999), coalesce(fts_rank, 9999)
limit $10
"""


async def fetch_candidates(
    conn: asyncpg.Connection,
    *,
    query_embedding: Sequence[float],
    space_id: str,
    query_text: str,
    source_ids: list[str] | None = None,
    vector_weight: float = 0.7,
    fts_weight: float = 0.3,
    rrf_k: int | None = None,
) -> list[Candidate]:
    """Generate fused candidates for one query.

    ``vector_weight`` and ``fts_weight`` weight each arm's RRF contribution. The
    weights are passed in rather than read from settings so a per-space override
    actually reaches the ranking — reading them here is what made the tuning UI a
    no-op before.
    """
    settings = get_settings()
    vec_literal = "[" + ",".join(f"{float(v):.6f}" for v in query_embedding) + "]"
    rows = await conn.fetch(
        _CANDIDATE_SQL,
        vec_literal,
        space_id,
        source_ids or None,
        settings.rag_vector_candidates,
        query_text,
        settings.rag_fts_candidates,
        float(vector_weight),
        float(fts_weight),
        rrf_k or settings.rag_rrf_k,
        max(settings.rag_vector_candidates, settings.rag_fts_candidates) * 2,
    )
    out: list[Candidate] = []
    for row in rows:
        out.append(
            Candidate(
                chunk_id=str(row["id"]),
                source_id=str(row["source_id"]),
                source_title=row["source_title"],
                content=row["content"],
                page=row["page"],
                vector_rank=row["vector_rank"],
                fts_rank=row["fts_rank"],
                vector_score=float(row["vector_score"]) if row["vector_score"] is not None else None,
                fts_score=float(row["fts_score"]) if row["fts_score"] is not None else None,
                fused_score=float(row["fused_score"] or 0.0),
            )
        )
    return out


# ---------------------------------------------------------------------------
# Reciprocal Rank Fusion (also usable standalone / in tests)
# ---------------------------------------------------------------------------

def reciprocal_rank_fusion(
    ranked_lists: list[list[str]],
    *,
    k: int = 60,
    weights: Sequence[float] | None = None,
) -> dict[str, float]:
    """RRF: score(d) = Σ 1/(k + rank_i(d)) over each ranked list."""
    weights = list(weights) if weights else [1.0] * len(ranked_lists)
    scores: dict[str, float] = {}
    for weight, ranked in zip(weights, ranked_lists):
        for rank, doc_id in enumerate(ranked, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + weight * (1.0 / (k + rank))
    return scores


# ---------------------------------------------------------------------------
# Rerankers
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def lexical_rerank(query: str, candidates: list[Candidate]) -> list[Candidate]:
    """BM25-style lexical rerank over the fused candidates (no model needed)."""
    if not candidates:
        return candidates
    q_tokens = _tokenize(query)
    if not q_tokens:
        for c in candidates:
            c.rerank_score = c.fused_score
        return candidates

    docs = [_tokenize(c.content) for c in candidates]
    avg_len = max(1.0, sum(len(d) for d in docs) / len(docs))
    df: dict[str, int] = {}
    for tokens in docs:
        for t in set(tokens):
            df[t] = df.get(t, 0) + 1

    k1, b = 1.5, 0.75
    n = len(docs)
    for cand, tokens in zip(candidates, docs):
        tf: dict[str, int] = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
        score = 0.0
        for term in q_tokens:
            if term not in tf:
                continue
            idf = 1.0 + __import__("math").log((n - df[term] + 0.5) / (df[term] + 0.5) + 1.0)
            freq = tf[term]
            denom = freq + k1 * (1 - b + b * len(tokens) / avg_len)
            score += idf * (freq * (k1 + 1)) / denom
        # blend with fused rank so both channels matter
        cand.rerank_score = score + 0.1 * cand.fused_score
    return candidates


async def cohere_rerank(query: str, candidates: list[Candidate]) -> list[Candidate]:
    """Hosted reranker (Cohere) — used only when RERANKER=cohere."""
    import httpx

    api_key = os.environ.get("COHERE_API_KEY", "")
    if not api_key or not candidates:
        return lexical_rerank(query, candidates)
    settings = get_settings()
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.cohere.com/v1/rerank",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": settings.reranker_model,
                "query": query,
                "documents": [c.content[:2000] for c in candidates],
                "top_n": len(candidates),
            },
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
    ordered: list[Candidate] = []
    seen: set[str] = set()
    for item in results:
        idx = item.get("index")
        if idx is None or idx >= len(candidates) or candidates[idx].chunk_id in seen:
            continue
        cand = candidates[idx]
        cand.rerank_score = float(item.get("relevance_score", 0.0))
        ordered.append(cand)
        seen.add(cand.chunk_id)
    for i, cand in enumerate(candidates):
        if cand.chunk_id not in seen:
            cand.rerank_score = float(cand.fused_score)
            ordered.append(cand)
    return ordered


def cross_encoder_rerank(query: str, candidates: list[Candidate]) -> list[Candidate]:
    """Local cross-encoder (optional heavy dependency, falls back to lexical)."""
    try:
        from sentence_transformers import CrossEncoder  # type: ignore
    except Exception:
        return lexical_rerank(query, candidates)
    settings = get_settings()
    try:
        model = CrossEncoder(settings.reranker_model)
        pairs = [(query, c.content[:2000]) for c in candidates]
        scores = model.predict(pairs)
        for cand, score in zip(candidates, scores):
            cand.rerank_score = float(score)
        return candidates
    except Exception:
        return lexical_rerank(query, candidates)


async def rerank(query: str, candidates: list[Candidate]) -> list[Candidate]:
    """Apply the configured reranker and compute final ordering."""
    settings = get_settings()
    if not candidates:
        return candidates
    if settings.reranker == "none":
        for c in candidates:
            c.rerank_score = c.fused_score
    elif settings.reranker == "lexical":
        lexical_rerank(query, candidates)
    elif settings.reranker == "cohere":
        candidates = await cohere_rerank(query, candidates)
    elif settings.reranker == "cross-encoder":
        candidates = cross_encoder_rerank(query, candidates)

    candidates.sort(key=lambda c: (c.rerank_score or 0.0), reverse=True)
    for i, cand in enumerate(candidates, start=1):
        # final score blends rerank + fused so ties prefer well-ranked docs
        cand.final_score = (cand.rerank_score or 0.0) + 0.01 * cand.fused_score
        cand.metadata["rank"] = i
    return candidates


async def hybrid_search(
    conn: asyncpg.Connection,
    *,
    query_text: str,
    query_embedding: Sequence[float],
    space_id: str,
    source_ids: list[str] | None = None,
    top_k: int | None = None,
    config: RagConfig | None = None,
) -> list[Candidate]:
    """End-to-end retrieval: candidates → weighted RRF (in SQL) → rerank → top_k.

    ``config`` carries a space's resolved tuning; omit it to use global defaults.
    When present, its weights, rrf_k, rerank depth and top_k all apply.
    """
    cfg = config or global_rag_config()
    candidates = await fetch_candidates(
        conn,
        query_embedding=query_embedding,
        space_id=space_id,
        query_text=query_text,
        source_ids=source_ids,
        vector_weight=cfg.vector_weight,
        fts_weight=cfg.fts_weight,
        rrf_k=cfg.rrf_k,
    )

    if cfg.rerank_enabled:
        # `rerank_top_n` is the cut before the reranker sees the list: the head of
        # the fused ranking gets rescored, the tail keeps its fused order. This is
        # what makes wide recall affordable — rerank cost scales with depth, not
        # with how many candidates were fetched.
        depth = max(cfg.rerank_top_n, 1)
        head, tail = candidates[:depth], candidates[depth:]
        ordered = await rerank(query_text, head) + tail
    else:
        # Reranking off still needs a defined order, so rank by the fused score
        # rather than returning candidates in whatever order the SQL emitted.
        ordered = sorted(
            candidates, key=lambda c: (-c.fused_score, c.vector_rank or 9999)
        )

    return ordered[: top_k or cfg.top_k]

"""Resolve per-space RAG configuration for the answer pipeline.

Every consumer of retrieval tuning — chat, studio generation, the eval suite —
should call :func:`resolve_rag_config` rather than reaching for
``get_settings()``. That keeps the precedence rule in exactly one place:

    per-space override  >  global default

and gives each caller the same resolved view the Settings panel displays, so what
the panel shows and what the pipeline does cannot drift apart.

The lookup is one indexed primary-key read on a table most spaces never write
to, which is cheap enough to do per request. It is wrapped so a database error
degrades to global defaults rather than failing the user's question — retrieval
tuning is a preference, not a correctness requirement.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import asyncpg

from studyspace.config import get_settings
from studyspace.models.ai_intelligence import RagConfig

logger = logging.getLogger(__name__)


def global_rag_config() -> RagConfig:
    """The deployment-wide baseline every space starts from."""
    s = get_settings()
    return RagConfig(
        top_k=s.rag_top_k,
        vector_weight=0.70,
        fts_weight=0.30,
        rrf_k=s.rag_rrf_k,
        rerank_enabled=s.reranker != "none",
        rerank_top_n=8,
        relevance_gate=s.layer_relevance_gate,
        relevance_threshold=float(s.relevance_threshold),
        citation_validation=s.layer_citation_validation,
        claim_verification=s.layer_claim_verification,
        temperature=0.30,
        max_tokens=s.llm_max_output_tokens,
        socratic_mode=False,
        # Model overrides: empty means "whatever the deployment routes this task to".
        chat_model=None,
        judge_model=None,
        generate_model=None,
    )


# Columns pulled into the resolved config. Kept in sync with `RagConfig`.
_SELECT = """
    top_k, vector_weight, fts_weight, rrf_k,
    rerank_enabled, rerank_top_n,
    relevance_gate, relevance_threshold, citation_validation, claim_verification,
    temperature, max_tokens, socratic_mode,
    chat_model, judge_model, generate_model
"""


async def resolve_rag_config(
    conn: asyncpg.Connection, space_id: str | UUID
) -> RagConfig:
    """Effective RAG config for ``space_id``, overridden by its settings row."""
    base = global_rag_config()
    try:
        row = await conn.fetchrow(
            f"select {_SELECT} from public.rag_settings where space_id = $1",
            str(space_id),
        )
    except Exception:  # noqa: BLE001 — tuning must never break an answer
        logger.warning(
            "rag_settings lookup failed for space %s; using global defaults", space_id,
            exc_info=True,
        )
        return base

    if row is None:
        return base

    # Only override with values the caller actually set. Columns are NOT NULL with
    # DB-level defaults, so a row always has all of them — but a value equal to
    # the global default is a no-op either way, and skipping absent keys keeps a
    # future nullable column from injecting None into a typed field.
    overrides = {
        # `type(x).model_fields`, not `x.model_fields`: Pydantic 2.11 deprecates
        # the instance form (removed in 3.0) and emits a warning per lookup.
        k: v for k, v in dict(row).items() if k in type(base).model_fields
    }
    if not overrides:
        return base
    return base.model_copy(update=overrides)


def layer_toggles(cfg: RagConfig) -> dict[str, bool]:
    """The three layer flags, shaped for `ChatRequest.layers`."""
    return {
        "relevance_gate": cfg.relevance_gate,
        "citation_validation": cfg.citation_validation,
        "claim_verification": cfg.claim_verification,
    }


def describe(cfg: RagConfig, defaults: RagConfig | None = None) -> dict[str, Any]:
    """Provenance for tracing: which knobs differ from the global baseline."""
    if defaults is None:
        defaults = global_rag_config()
    return {
        k: getattr(cfg, k)
        for k in type(cfg).model_fields
        if getattr(cfg, k) != getattr(defaults, k)
    }

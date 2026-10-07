"""Execute an eval run — the chat pipeline without persistence, scored.

One run is (layer configs x dataset questions): up to 8 configs over up
to 200 questions, processed EVAL_CONCURRENCY at a time. Each result
answers exactly as run_chat would — same retrieval, same gate math,
same prompt, claim layer included through the shared verify_claims —
minus persistence, because an eval must not drop ~400 messages into the
admin's chat history. Questions are asked cold (no thread history) and
non-socratic: the golden dataset expects answers, not guiding questions.

Scoring comes from eval_metrics: ragas computes the four standard
scores for answerable questions, the custom three fall out of the
delivered text. Rows land in eval_results with their config attribution
(migration 0011), and the finalized summary is the flat shape
AdminEvals reads.

Failure policy mirrors ingest_source: a question that blows up becomes
a failed row (metrics.error) and the other results carry on; run-level
problems (no space, dataset version mismatch, malformed plan) fail the
run itself with an operator-readable message in eval_runs.error. arq
may retry the job (max_tries=3), so the runner clears the run's
existing results on entry — a retry starts from zero, never doubles.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any

import asyncpg
from pydantic import ValidationError

from studyspace.config import get_settings
from studyspace.db_service import service_conn
from studyspace.models.ai_intelligence import RagConfig
from studyspace.models.chat import LayerToggles
from studyspace.models.evals import DEFAULT_CONFIGS, EvalConfig
from studyspace.services import llm
from studyspace.services.embeddings import embed_query
from studyspace.services.eval_dataset import load_dataset
from studyspace.services.eval_metrics import (
    JudgeLLM,
    aggregate_summary,
    citation_metrics,
    looks_like_not_found,
    standard_scores,
)
from studyspace.services.rag import (
    CITE_RE,
    NOT_FOUND_HEADING,
    ResolvedLayers,
    build_messages,
    not_found_message,
    resolve_layers,
    strip_invalid_citations,
    verify_claims,
)
from studyspace.services.rag_config import resolve_rag_config
from studyspace.services.retrieval import Candidate, hybrid_search

_RESULT_INSERT = (
    "insert into public.eval_results "
    "(user_id, run_id, question_id, config, question, kind, answer, reference, "
    " contexts, citations, status, metrics) "
    "values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb)"
)


@dataclass
class EvalAnswer:
    """One question's pipeline outcome, ready to score and store."""

    answer: str
    status: str  # verified | low_confidence | not_found (the 0005 vocabulary)
    candidates: list[Candidate]
    latency_ms: int
    cost_usd: float


async def answer_question(
    conn: asyncpg.Connection,
    *,
    question: str,
    space_id: str,
    layers: ResolvedLayers,
    cfg: RagConfig,
) -> EvalAnswer:
    """Retrieve, gate, generate and layer-apply one question — no persistence.

    Mirrors run_chat step for step (see run_chat for the reasoning behind
    each gate), minus history, threads and writes.
    """
    started = time.monotonic()
    query_emb = await embed_query(question)
    candidates = await hybrid_search(
        conn,
        query_text=question,
        query_embedding=query_emb,
        space_id=space_id,
        config=cfg,
    )

    # layer 1: the relevance gate, same abstain-vs-veto rule as chat
    scored = [c.vector_score for c in candidates if c.vector_score is not None]
    best_sim = max(scored, default=None)
    gate_failed = not candidates or (
        layers.relevance_gate
        and best_sim is not None
        and best_sim < cfg.relevance_threshold
    )
    if gate_failed:
        return EvalAnswer(
            answer=not_found_message(),
            status="not_found",
            candidates=candidates,
            latency_ms=int((time.monotonic() - started) * 1000),
            cost_usd=0.0,
        )

    messages = build_messages(question, candidates, [], socratic=False)
    raw = await llm.chat(
        messages, temperature=cfg.temperature, max_tokens=cfg.max_tokens
    )
    cost = llm.estimate_cost_usd(
        get_settings().litellm_model,
        sum(len(m["content"]) for m in messages),
        len(raw),
    )

    # layer 2: citation validation
    answer = raw
    if layers.citation_validation:
        answer, _removed = strip_invalid_citations(
            raw, set(range(1, len(candidates) + 1))
        )
    status = "verified"
    if answer.strip().startswith(NOT_FOUND_HEADING):
        status = "not_found"

    # layer 3 + its companion rule — the same function chat awaits
    answer, status, _records = await verify_claims(
        question, answer, status, candidates, layers, cfg
    )
    return EvalAnswer(
        answer=answer,
        status=status,
        candidates=candidates,
        latency_ms=int((time.monotonic() - started) * 1000),
        cost_usd=cost,
    )


def cited_citations(answer: str, candidates: list[Candidate]) -> list[dict[str, Any]]:
    """The labels the delivered answer actually cites, mapped to their chunks."""
    present = {int(m) for m in CITE_RE.findall(answer)}
    return [
        {
            "label": i,
            "chunk_id": c.chunk_id,
            "source_id": c.source_id,
            "source_title": c.source_title,
            "page": c.page,
        }
        for i, c in enumerate(candidates, start=1)
        if i in present
    ]


def plan_run(
    config: dict[str, Any], dataset_version: str, doc: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Validate a stored run config against the packaged dataset.

    Raises ValueError with an operator-readable message: every failure
    here ends up verbatim in eval_runs.error, which is all the admin
    sees when a run dies before its first result.
    """
    actual = doc.get("version")
    if dataset_version != actual:
        raise ValueError(
            f"dataset version {dataset_version!r} was requested but the "
            f"packaged dataset is {actual!r}"
        )
    raw_configs = config.get("configs") or DEFAULT_CONFIGS
    configs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(raw_configs):
        try:
            parsed = EvalConfig.model_validate(item).model_dump()
        except ValidationError as exc:
            raise ValueError(
                f"config #{index + 1} is malformed: {exc.errors()[0]['msg']}"
            ) from exc
        if parsed["name"] in seen:
            raise ValueError(
                f"duplicate config name {parsed['name']!r} — results would be "
                "indistinguishable"
            )
        seen.add(parsed["name"])
        configs.append(parsed)

    limit = config.get("limit")
    questions = list(doc.get("questions", []))
    if limit is not None:
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 200:
            raise ValueError(f"limit must be an integer 1..200, got {limit!r}")
        questions = questions[:limit]
    if not questions:
        raise ValueError("dataset has no questions to run")
    return configs, questions


async def _score_and_store(
    conn: asyncpg.Connection,
    *,
    run_id: str,
    user_id: str,
    space_id: str,
    cfg: RagConfig,
    layers: ResolvedLayers,
    config_name: str,
    question: dict[str, Any],
) -> None:
    """Answer and score one (config, question) pair; never raises for the
    question's own faults — those become a failed row."""
    started = time.monotonic()
    judge = JudgeLLM()
    answer_cost = 0.0
    try:
        answer = await answer_question(
            conn,
            question=question["question"],
            space_id=space_id,
            layers=layers,
            cfg=cfg,
        )
        answer_cost = answer.cost_usd

        metrics: dict[str, Any] = {}
        if question["kind"] == "answerable":
            metrics.update(
                await standard_scores(
                    question=question["question"],
                    answer=answer.answer,
                    contexts=[c.content for c in answer.candidates],
                    reference=question["reference"],
                    judge=judge,
                )
            )
        else:
            # the reference for these is the expectation of absence; the
            # only honest score is whether the run said so
            metrics["correct_not_found"] = looks_like_not_found(answer.answer)
        metrics.update(citation_metrics(answer.answer, len(answer.candidates)))
        metrics["latency_ms"] = int((time.monotonic() - started) * 1000)
        metrics["cost_usd"] = round(answer_cost + judge.cost_usd, 6)

        await conn.execute(
            _RESULT_INSERT,
            user_id,
            run_id,
            question["id"],
            config_name,
            question["question"],
            question["kind"],
            answer.answer,
            question.get("reference"),
            json.dumps([c.content for c in answer.candidates]),
            json.dumps(cited_citations(answer.answer, answer.candidates)),
            answer.status,
            json.dumps(metrics),
        )
    except Exception as exc:  # noqa: BLE001 — one bad question must not kill the rest
        metrics = {
            "error": str(exc)[:300],
            "latency_ms": int((time.monotonic() - started) * 1000),
            "cost_usd": round(answer_cost + judge.cost_usd, 6),
        }
        await conn.execute(
            _RESULT_INSERT,
            user_id,
            run_id,
            question["id"],
            config_name,
            question["question"],
            question["kind"],
            None,
            question.get("reference"),
            "[]",
            "[]",
            None,
            json.dumps(metrics),
        )


async def execute_run(run_id: str, user_id: str) -> None:
    """Run one eval suite to completion; sets the run's status itself.

    Connection blocks stay short: service_conn wraps everything in one
    transaction, and a run takes minutes — holding one open for the
    duration would pin an idle-in-transaction session for no reason.
    """
    try:
        async with service_conn() as conn:
            run = await conn.fetchrow(
                "select id, user_id, dataset_version, config "
                "from public.eval_runs where id = $1",
                run_id,
            )
            if run is None:
                raise ValueError(f"eval run {run_id} does not exist")
            if str(run["user_id"]) != user_id:
                raise ValueError(f"eval run {run_id} was created by another user")
            stored = run["config"]
            stored = json.loads(stored) if isinstance(stored, str) else (stored or {})
            doc = load_dataset()
            configs, questions = plan_run(stored, run["dataset_version"], doc)
            space = await conn.fetchrow(
                "select id from public.spaces where user_id = $1 "
                "order by created_at desc limit 1",
                user_id,
            )
            if space is None:
                raise ValueError(
                    "no space to evaluate — create a space and ingest a source "
                    "first, so retrieval has something to ground on"
                )
            space_id = str(space["id"])
            cfg = await resolve_rag_config(conn, space_id)

        total = len(configs) * len(questions)
        async with service_conn() as conn:
            # arq retries re-enter here: clear, never double
            await conn.execute(
                "delete from public.eval_results where run_id = $1", run_id
            )
            await conn.execute(
                "update public.eval_runs set status = 'running', "
                "started_at = coalesce(started_at, now()), error = null, "
                "finished_at = null, "
                "summary = jsonb_build_object('done', 0, 'total', $2::int) "
                "where id = $1",
                run_id,
                total,
            )

        semaphore = asyncio.Semaphore(get_settings().eval_concurrency)

        async def one(config: dict[str, Any], question: dict[str, Any]) -> None:
            async with semaphore:
                async with service_conn() as conn:
                    await _score_and_store(
                        conn,
                        run_id=run_id,
                        user_id=user_id,
                        space_id=space_id,
                        cfg=cfg,
                        layers=resolve_layers(
                            LayerToggles(
                                relevance_gate=config["relevance_gate"],
                                citation_validation=config["citation_validation"],
                                claim_verification=config["claim_verification"],
                            ),
                            cfg,
                        ),
                        config_name=config["name"],
                        question=question,
                    )
                    # progress straight from the rows, so two finishing
                    # tasks cannot write the same done count twice
                    await conn.execute(
                        "update public.eval_runs set summary = jsonb_build_object("
                        " 'done', (select count(*) from public.eval_results "
                        "           where run_id = $1),"
                        " 'total', $2::int) where id = $1",
                        run_id,
                        total,
                    )

        tasks = [
            asyncio.create_task(one(config, question))
            for config in configs
            for question in questions
        ]
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            # stop the stragglers before the except-block declares failure —
            # otherwise a retry could delete results while they are still writing
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

        async with service_conn() as conn:
            rows = [
                dict(r)
                for r in await conn.fetch(
                    "select status, kind, metrics from public.eval_results "
                    "where run_id = $1",
                    run_id,
                )
            ]
            for row in rows:
                if isinstance(row["metrics"], str):
                    row["metrics"] = json.loads(row["metrics"])
            summary = aggregate_summary(rows)
            await conn.execute(
                "update public.eval_runs set status = 'completed', summary = $2, "
                "finished_at = now() where id = $1",
                run_id,
                json.dumps(summary),
            )
    except Exception as exc:  # noqa: BLE001 — mark the run failed, then re-raise
        async with service_conn() as conn:
            await conn.execute(
                "update public.eval_runs set status = 'failed', error = $2, "
                "finished_at = now() where id = $1",
                run_id,
                str(exc)[:500],
            )
        raise


__all__ = [
    "EvalAnswer",
    "answer_question",
    "cited_citations",
    "execute_run",
    "plan_run",
]

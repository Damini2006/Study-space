"""Eval metrics: ragas computes the four standard scores, we transport the calls.

Migration 0005 reserved this suite's metric names — faithfulness,
answer_relevancy, context_precision, context_recall (the standard four)
plus citation_precision, hallucination and correct_not_found (the custom
three). ragas 0.4 implements the four; this module answers ragas's
instructor-style interface through services.llm and services.embeddings,
so judge traffic rides the same model settings, retries and error
mapping as every other LLM call in the repo instead of ragas's own
openai client reading keys from the side. The custom three come from the
pipeline's own outputs — no model involved, so they are exact.

Two naming layers, both deliberate:
- per-result `metrics` jsonb keeps 0005's full names (what the schema
  comment promises);
- the run `summary` the admin UI reads is flat — summary.relevancy,
  summary.precision — and aggregate_summary() is the translation.
"""

from __future__ import annotations

import asyncio
import json
import math
import re
from statistics import mean
from typing import Any

from pydantic import BaseModel, ValidationError
from ragas.embeddings import BaseRagasEmbedding
from ragas.llms.base import InstructorBaseRagasLLM
from ragas.metrics.collections import (
    AnswerRelevancy,
    ContextPrecision,
    ContextRecall,
    Faithfulness,
)

from studyspace.config import get_settings
from studyspace.services import llm
from studyspace.services.embeddings import embed_query
from studyspace.services.rag import CITE_RE, NOT_FOUND_HEADING, strip_invalid_citations

# The house decline, verbatim or paraphrased close enough to count: the
# prompt asks for this heading even with the gate off, and the gate
# returns it canned when on.
_NOT_FOUND_TIGHT = re.compile(
    r"could(?: ?not|n'?t) find .{0,60} in (?:your|the|these|provided) sources",
    re.IGNORECASE,
)


class JudgeLLM(InstructorBaseRagasLLM):
    """ragas's structured-output interface, answered by services.llm.

    ragas builds its prompts with the output JSON schema already inside
    (BasePrompt.to_string), so all this wrapper owes is: ask for JSON,
    validate, and reask once with the validator's complaint — which is
    exactly what every other structured caller here gets from
    llm.chat_json plus pydantic.
    """

    async def agenerate(self, prompt: str, response_model: type[BaseModel]) -> Any:
        judge = get_settings().litellm_judge_model
        messages = [{"role": "user", "content": prompt}]
        data = await llm.chat_json(messages, model=judge)
        try:
            return response_model.model_validate(data)
        except ValidationError as first:
            messages = [
                *messages,
                {"role": "assistant", "content": json.dumps(data, default=str)},
                {
                    "role": "user",
                    "content": f"That reply did not validate: {first}. Return a corrected JSON object.",
                },
            ]
            data = await llm.chat_json(messages, model=judge)
            return response_model.model_validate(data)

    def generate(self, prompt: str, response_model: type[BaseModel]) -> Any:
        raise RuntimeError("the eval judge runs on the async path only (await agenerate)")


class HouseEmbeddings(BaseRagasEmbedding):
    """Answer relevancy's cosine similarity, embedded by our own service.

    async only, proven by usage: every metric in the four reaches
    aembed_text, none calls the sync path.
    """

    async def aembed_text(self, text: str, **kwargs: Any) -> list[float]:
        return await embed_query(text)

    def embed_text(self, text: str, **kwargs: Any) -> list[float]:
        raise RuntimeError("the eval embeddings run on the async path only")


def build_metrics() -> dict[str, Any]:
    """Fresh metric set per run — prompts are state, results are not."""
    judge = JudgeLLM()
    return {
        "faithfulness": Faithfulness(llm=judge),
        "answer_relevancy": AnswerRelevancy(llm=judge, embeddings=HouseEmbeddings()),
        "context_precision": ContextPrecision(llm=judge),
        "context_recall": ContextRecall(llm=judge),
    }


def _score_or_none(value: Any) -> float | None:
    """Round a ragas score; NaN becomes null (jsonb refuses NaN, and
    'could not be measured' is not 0)."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return round(number, 4)


async def standard_scores(
    *,
    question: str,
    answer: str,
    contexts: list[str],
    reference: str,
) -> dict[str, float | None]:
    """The four standard metrics for one answerable question.

    With no retrieved contexts, grounding cannot be measured: the three
    context metrics come back null (not zero) and only relevancy runs —
    ragas itself would raise on the empty context list.
    """
    metrics = build_metrics()
    jobs: dict[str, Any] = {
        "answer_relevancy": metrics["answer_relevancy"].ascore(
            user_input=question, response=answer
        ),
    }
    if contexts:
        jobs["faithfulness"] = metrics["faithfulness"].ascore(
            user_input=question, response=answer, retrieved_contexts=contexts
        )
        jobs["context_precision"] = metrics["context_precision"].ascore(
            user_input=question, reference=reference, retrieved_contexts=contexts
        )
        jobs["context_recall"] = metrics["context_recall"].ascore(
            user_input=question, retrieved_contexts=contexts, reference=reference
        )
    else:
        jobs["faithfulness"] = None
        jobs["context_precision"] = None
        jobs["context_recall"] = None

    names = [name for name, job in jobs.items() if job is not None]
    results = await asyncio.gather(*(jobs[name] for name in names))
    out: dict[str, float | None] = {
        "faithfulness": None,
        "answer_relevancy": None,
        "context_precision": None,
        "context_recall": None,
    }
    out.update(
        {name: _score_or_none(result.value) for name, result in zip(names, results, strict=True)}
    )
    return out


def citation_metrics(answer: str, retrieved_count: int) -> dict[str, Any]:
    """Citation precision and the hallucination flag, from the markers
    that survived the pipeline.

    A label outside 1..retrieved_count is a passage the answer invented:
    if it is still in the delivered text, the run hallucinated a source
    (baseline configs keep them; citation validation strips them, and
    that difference is the point of the ablation).
    """
    valid = set(range(1, max(retrieved_count, 0) + 1))
    _cleaned, removed = strip_invalid_citations(answer, valid)
    total = len(CITE_RE.findall(answer))
    return {
        "citation_total": total,
        "citation_precision": (round((total - len(removed)) / total, 4) if total else None),
        "hallucination": bool(removed),
    }


def looks_like_not_found(answer: str) -> bool:
    """Did the run correctly decline an unanswerable question?"""
    return NOT_FOUND_HEADING.strip().lower() in answer.lower() or bool(
        _NOT_FOUND_TIGHT.search(answer)
    )


def _mean_or_none(values: list[float]) -> float | None:
    return round(mean(values), 4) if values else None


def aggregate_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Flatten stored eval_results rows into the run summary the UI reads.

    Rows look like {status, kind, metrics, ...}; metrics is 0005's jsonb.
    total counts every row and passed the ok ones, so a failed row shows
    as 4/5 instead of disappearing; rates and means run over the rows
    that actually carry metrics. Rates have explicit denominators:
    hallucination over every measured result, correct-not-found over the
    unanswerable ones (no results of a kind measures nothing, so the
    rate is 0). Standard-score means skip nulls — a metric that could
    not be measured does not drag the average toward zero.
    """
    measured = [r for r in results if r.get("metrics")]

    def numeric(key: str) -> list[float]:
        return [
            r["metrics"][key]
            for r in measured
            if isinstance(r["metrics"].get(key), (int, float))
        ]

    unanswerable = [r for r in measured if r.get("kind") == "unanswerable"]
    latencies = numeric("latency_ms")
    costs = numeric("cost_usd")
    hallucinated = sum(1 for r in measured if r["metrics"].get("hallucination"))
    declined = sum(
        1 for r in unanswerable if r["metrics"].get("correct_not_found")
    )

    return {
        "total": len(results),
        "passed": sum(1 for r in results if r.get("status") == "ok"),
        "hallucination_rate": round(hallucinated / len(measured), 4) if measured else 0.0,
        "correct_not_found_rate": round(declined / len(unanswerable), 4) if unanswerable else 0.0,
        "avg_latency_ms": round(mean(latencies)) if latencies else None,
        "cost_usd": round(sum(costs), 6) if costs else 0.0,
        "faithfulness": _mean_or_none(numeric("faithfulness")),
        "relevancy": _mean_or_none(numeric("answer_relevancy")),
        "precision": _mean_or_none(numeric("context_precision")),
        "recall": _mean_or_none(numeric("context_recall")),
    }


__all__ = [
    "HouseEmbeddings",
    "JudgeLLM",
    "aggregate_summary",
    "build_metrics",
    "citation_metrics",
    "looks_like_not_found",
    "standard_scores",
]

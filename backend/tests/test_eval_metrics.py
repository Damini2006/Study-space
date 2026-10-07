"""The eval metrics: judge wiring, exact custom scores, summary contract.

The interop test matters most: it runs a REAL ragas metric through
JudgeLLM with only the transport mocked, proving the adapter speaks
ragas's structured-output interface for real (prompts, schema, verdict
parsing, scoring) — not merely that our own helpers return what we put
in. Everything else pins the custom scores' arithmetic and the flat
summary keys the admin UI reads.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from studyspace.services import eval_metrics
from studyspace.services.eval_metrics import (
    JudgeLLM,
    aggregate_summary,
    citation_metrics,
    looks_like_not_found,
)


class _Output(BaseModel):
    items: list[str]


# ---------------------------------------------------------------------------
# JudgeLLM — the ragas <-> services.llm adapter
# ---------------------------------------------------------------------------

async def test_judge_validates_the_first_reply(monkeypatch):
    calls = []

    async def fake_chat_json(messages, **kwargs):
        calls.append(kwargs.get("model"))
        return {"items": ["a", "b"]}

    monkeypatch.setattr(eval_metrics.llm, "chat_json", fake_chat_json)
    result = await JudgeLLM().agenerate("prompt", _Output)
    assert isinstance(result, _Output)
    assert result.items == ["a", "b"]
    # the judge model comes from settings, not a hard-coded provider
    assert calls == ["gpt-4o-mini"]


async def test_judge_reasks_once_when_the_reply_does_not_validate(monkeypatch):
    calls = 0
    seen = []

    async def fake_chat_json(messages, **kwargs):
        nonlocal calls
        calls += 1
        seen.append(messages)
        if calls == 1:
            return {"wrong": "shape"}
        return {"items": ["fixed"]}

    monkeypatch.setattr(eval_metrics.llm, "chat_json", fake_chat_json)
    result = await JudgeLLM().agenerate("prompt", _Output)
    assert result.items == ["fixed"]
    assert calls == 2
    # the reask carries the validator's complaint, not a silent retry
    reask = seen[1][-1]["content"]
    assert "did not validate" in reask


async def test_judge_raises_after_the_reask_still_fails(monkeypatch):
    async def fake_chat_json(messages, **kwargs):
        return {"wrong": "shape"}

    monkeypatch.setattr(eval_metrics.llm, "chat_json", fake_chat_json)
    with pytest.raises(ValueError):  # pydantic ValidationError, not Exception
        await JudgeLLM().agenerate("prompt", _Output)


def test_judge_sync_path_is_a_clear_error():
    with pytest.raises(RuntimeError, match="async"):
        JudgeLLM().generate("prompt", _Output)


# ---------------------------------------------------------------------------
# HouseEmbeddings
# ---------------------------------------------------------------------------

async def test_embeddings_go_through_the_house_service(monkeypatch):
    async def fake_embed_query(text):
        assert text == "what is atp"
        return [0.5, 0.25]

    monkeypatch.setattr(eval_metrics, "embed_query", fake_embed_query)
    vector = await eval_metrics.HouseEmbeddings().aembed_text("what is atp")
    assert vector == [0.5, 0.25]


def test_embeddings_sync_path_is_a_clear_error():
    with pytest.raises(RuntimeError, match="async"):
        eval_metrics.HouseEmbeddings().embed_text("x")


# ---------------------------------------------------------------------------
# standard_scores — orchestration
# ---------------------------------------------------------------------------

class _FakeMetric:
    def __init__(self, value):
        self.value = value
        self.kwargs = None

    async def ascore(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(value=self.value)


async def test_standard_scores_use_0005_names_and_map_nan_to_null(monkeypatch):
    stubs = {
        "faithfulness": _FakeMetric(0.75),
        "answer_relevancy": _FakeMetric(float("nan")),
        "context_precision": _FakeMetric(0.5),
        "context_recall": _FakeMetric(1),
    }
    monkeypatch.setattr(eval_metrics, "build_metrics", lambda: stubs)

    scores = await eval_metrics.standard_scores(
        question="q", answer="a", contexts=["c1"], reference="r"
    )
    assert set(scores) == {
        "faithfulness",
        "answer_relevancy",
        "context_precision",
        "context_recall",
    }
    assert scores["faithfulness"] == 0.75
    assert scores["answer_relevancy"] is None  # jsonb refuses NaN; unknown is not 0
    assert scores["context_recall"] == 1.0
    assert stubs["faithfulness"].kwargs["retrieved_contexts"] == ["c1"]


async def test_standard_scores_without_contexts_measure_only_relevancy(monkeypatch):
    stubs = {name: _FakeMetric(1.0) for name in (
        "faithfulness", "answer_relevancy", "context_precision", "context_recall",
    )}
    monkeypatch.setattr(eval_metrics, "build_metrics", lambda: stubs)

    scores = await eval_metrics.standard_scores(
        question="q", answer="a", contexts=[], reference="r"
    )
    assert scores["answer_relevancy"] == 1.0
    assert scores["faithfulness"] is None
    assert scores["context_precision"] is None
    assert scores["context_recall"] is None
    assert stubs["faithfulness"].kwargs is None  # never even asked


async def test_a_real_ragas_faithfulness_runs_through_our_judge(monkeypatch):
    """ragas <-> JudgeLLM interop: real prompts, real parsing, real score."""

    async def fake_chat_json(messages, **kwargs):
        prompt = messages[-1]["content"]
        if "complexity of each sentence" in prompt:
            return {"statements": ["Cell membranes are built from a lipid bilayer."]}
        if "judge the faithfulness of a series" in prompt:
            return {
                "statements": [
                    {
                        "statement": "Cell membranes are built from a lipid bilayer.",
                        "reason": "the context states exactly this",
                        "verdict": 1,
                    }
                ]
            }
        raise AssertionError(f"unexpected ragas prompt: {prompt[:120]}")

    monkeypatch.setattr(eval_metrics.llm, "chat_json", fake_chat_json)
    metric = eval_metrics.build_metrics()["faithfulness"]
    result = await metric.ascore(
        user_input="What are cell membranes made of?",
        response="Cell membranes are built from a lipid bilayer.",
        retrieved_contexts=["Membranes consist of a lipid bilayer with embedded proteins."],
    )
    assert 0.0 <= result.value <= 1.0
    assert result.value == 1.0  # the single statement was supported


# ---------------------------------------------------------------------------
# Custom scores — exact, no model
# ---------------------------------------------------------------------------

def test_citation_precision_and_hallucination_flag():
    # both labels in range: precise, no hallucination
    ok = citation_metrics("ATP is energy [1], made in mitochondria [2].", retrieved_count=2)
    assert ok == {"citation_total": 2, "citation_precision": 1.0, "hallucination": False}

    # [9] points at a passage that was never retrieved — invented source
    bad = citation_metrics("Proven [1], invented [9].", retrieved_count=1)
    assert bad["citation_precision"] == 0.5
    assert bad["hallucination"] is True

    # no citations at all: precision is undefined, not perfect
    none = citation_metrics("A plain answer with no markers.", retrieved_count=3)
    assert none["citation_precision"] is None
    assert none["hallucination"] is False

    # the citation-validation layer strips bad markers before delivery,
    # so a gated answer cannot carry the flag — that contrast is the point
    stripped = citation_metrics("Proven [1] .", retrieved_count=1)
    assert stripped["hallucination"] is False


def test_correct_not_found_recognises_the_house_decline():
    from studyspace.services.rag import NOT_FOUND_HEADING

    canned = NOT_FOUND_HEADING + "\n\nTry one of these:\n- Upload notes"
    assert looks_like_not_found(canned) is True
    assert looks_like_not_found("I couldn't find this in your sources.") is True
    # paraphrase the model might produce with the gate off
    assert looks_like_not_found("I could not find that in the sources you gave me.") is True
    # an invented answer to an unanswerable question must not count
    assert looks_like_not_found("Paris is the capital of France.") is False
    assert looks_like_not_found("") is False


# ---------------------------------------------------------------------------
# Summary — the flat contract the admin UI reads
# ---------------------------------------------------------------------------

def test_aggregate_summary_shape_and_arithmetic():
    rows = [
        {
            "status": "ok",
            "kind": "answerable",
            "metrics": {
                "faithfulness": 0.5,
                "answer_relevancy": 1.0,
                "context_precision": None,  # unmeasured: must not drag the mean
                "context_recall": 0.4,
                "hallucination": True,
                "latency_ms": 100,
                "cost_usd": 0.001,
            },
        },
        {
            "status": "ok",
            "kind": "answerable",
            "metrics": {
                "faithfulness": 1.0,
                "answer_relevancy": 0.5,
                "context_precision": 0.6,
                "context_recall": None,
                "hallucination": False,
                "latency_ms": 300,
                "cost_usd": 0.003,
            },
        },
        {
            "status": "ok",
            "kind": "unanswerable",
            "metrics": {
                "correct_not_found": True,
                "hallucination": False,
                "latency_ms": 200,
                "cost_usd": 0.002,
            },
        },
        {"status": "failed", "kind": "answerable", "metrics": {}},
    ]

    summary = aggregate_summary(rows)
    assert set(summary) == {
        "total", "passed", "hallucination_rate", "correct_not_found_rate",
        "avg_latency_ms", "cost_usd", "faithfulness", "relevancy", "precision", "recall",
    }
    assert summary["total"] == 4  # the failed row is counted, not hidden
    assert summary["passed"] == 3  # ...and only the ok ones are passed
    assert summary["hallucination_rate"] == 0.3333  # 1 in 3 measured, rounded
    assert summary["correct_not_found_rate"] == 1.0  # denominator = unanswerable only
    assert summary["avg_latency_ms"] == 200  # 100+300+200
    assert summary["cost_usd"] == 0.006
    assert summary["faithfulness"] == 0.75  # (0.5 + 1.0) / 2, None skipped
    assert summary["relevancy"] == 0.75
    assert summary["precision"] == 0.6  # only one measured value
    assert summary["recall"] == 0.4


def test_aggregate_summary_of_nothing_still_has_every_key():
    summary = aggregate_summary([])
    assert summary["total"] == 0
    assert summary["hallucination_rate"] == 0.0
    assert summary["correct_not_found_rate"] == 0.0
    assert summary["cost_usd"] == 0.0
    assert summary["avg_latency_ms"] is None
    assert summary["faithfulness"] is None  # null, so the UI prints an em dash

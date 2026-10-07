"""The eval runner: plan validation, the non-persisting answer, the run.

Answer tests stub the two seams (retrieval and the LLM) — the gate
math, citation stripping and the shared claim layer underneath are the
real functions. Lifecycle tests run against the live test database with
answer_question and standard_scores stubbed: they are about status
transitions, config attribution and the summary, not about generation,
so no test here can reach the network.
"""

from __future__ import annotations

import json

import pytest
from conftest import headers_for

from studyspace.models.chat import LayerToggles
from studyspace.models.evals import DEFAULT_CONFIGS
from studyspace.services import eval_runner, rag
from studyspace.services.eval_dataset import load_dataset
from studyspace.services.eval_runner import (
    EvalAnswer,
    answer_question,
    cited_citations,
    execute_run,
    plan_run,
)
from studyspace.services.rag import resolve_layers
from studyspace.services.rag_config import global_rag_config
from studyspace.services.retrieval import Candidate

ALICE = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "email": "alice@test.dev"}
BOB = {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "email": "bob@test.dev"}

_TWO_CONFIGS = {
    "configs": [
        DEFAULT_CONFIGS[0],
        DEFAULT_CONFIGS[1],
    ],
    "limit": 2,
}


def _doc(version: str = "v1", questions: list | None = None) -> dict:
    return {
        "version": version,
        "questions": questions
        if questions is not None
        else [{"id": "q001", "kind": "answerable", "question": "q", "reference": "r"}],
    }


# ---------------------------------------------------------------------------
# plan_run — an invalid plan must die before the first LLM call
# ---------------------------------------------------------------------------


def test_plan_defaults_to_the_full_ablation_ladder():
    configs, questions = plan_run({}, "v1", _doc())
    assert [c["name"] for c in configs] == [
        "baseline", "+relevance-gate", "+citation-validation", "+claim-verification",
    ]
    assert len(questions) == 1


def test_plan_slices_the_dataset_by_limit():
    many = [
        {"id": f"q{i:03}", "kind": "answerable", "question": "q", "reference": "r"}
        for i in range(1, 6)
    ]
    _configs, questions = plan_run({"limit": 3}, "v1", _doc(questions=many))
    assert [q["id"] for q in questions] == ["q001", "q002", "q003"]


def test_plan_refuses_a_dataset_version_that_is_not_packaged():
    with pytest.raises(ValueError, match="packaged dataset is 'v1'"):
        plan_run({}, "v9", _doc())


def test_plan_refuses_duplicate_config_names():
    cfg = {"configs": [DEFAULT_CONFIGS[0], dict(DEFAULT_CONFIGS[0])]}
    with pytest.raises(ValueError, match="duplicate config name 'baseline'"):
        plan_run(cfg, "v1", _doc())


def test_plan_refuses_a_malformed_config():
    with pytest.raises(ValueError, match="config #1 is malformed"):
        plan_run({"configs": [{"relevance_gate": True}]}, "v1", _doc())


def test_plan_refuses_an_impossible_limit():
    with pytest.raises(ValueError, match="limit must be an integer"):
        plan_run({"limit": 0}, "v1", _doc())


def test_plan_refuses_an_empty_dataset():
    with pytest.raises(ValueError, match="no questions"):
        plan_run({}, "v1", _doc(questions=[]))


# ---------------------------------------------------------------------------
# answer_question — the pipeline without persistence
# ---------------------------------------------------------------------------


def _cands(*scores: float) -> list[Candidate]:
    return [
        Candidate(
            chunk_id=f"c{i}",
            source_id="s1",
            source_title="Biology notes",
            content="Mitochondria make ATP through respiration.",
            page=1,
            vector_score=score,
        )
        for i, score in enumerate(scores, start=1)
    ]


def _layers(**toggles: bool):
    return resolve_layers(LayerToggles(**toggles), None)


def _wire(monkeypatch, *, cands, reply="Mitochondria make ATP [1].", gate=None):
    """Stub embed/retrieve/LLM; return (captured_messages, chat_calls)."""
    captured: dict = {"messages": None, "calls": 0}

    async def fake_embed(text):
        return [0.0] * 8

    async def fake_search(conn, *, query_text, query_embedding, space_id, config):
        return cands

    async def fake_chat(messages, **kwargs):
        captured["messages"] = messages
        captured["calls"] += 1
        return reply

    monkeypatch.setattr(eval_runner, "embed_query", fake_embed)
    monkeypatch.setattr(eval_runner, "hybrid_search", fake_search)
    monkeypatch.setattr(eval_runner, "llm", type("L", (), {
        "chat": staticmethod(fake_chat),
        "estimate_cost_usd": staticmethod(lambda *a: 0.01),
    })())
    return captured


async def test_no_candidates_gates_before_any_llm_call(monkeypatch):
    captured = _wire(monkeypatch, cands=[])
    layers = _layers(
        relevance_gate=True, citation_validation=True, claim_verification=True
    )

    result = await answer_question(
        None, question="What is ATP?", space_id="sp", layers=layers,
        cfg=global_rag_config(),
    )

    from studyspace.services.rag import not_found_message

    assert result.answer == not_found_message()
    assert result.status == "not_found"
    assert result.cost_usd == 0.0
    assert captured["calls"] == 0  # nothing to ground on: no generation at all


async def test_low_similarity_is_vetoed_only_when_the_gate_is_on(monkeypatch):
    captured = _wire(monkeypatch, cands=_cands(0.05))  # below the 0.30 floor
    cfg = global_rag_config()

    vetoed = await answer_question(
        None, question="q", space_id="sp",
        layers=_layers(relevance_gate=True), cfg=cfg,
    )
    assert vetoed.status == "not_found"
    assert captured["calls"] == 0

    answered = await answer_question(
        None, question="q", space_id="sp",
        layers=_layers(relevance_gate=False), cfg=cfg,
    )
    assert answered.status == "verified"
    assert captured["calls"] == 1  # gate off: the model still answered


async def test_citation_validation_strips_invented_labels_but_baseline_keeps_them(
    monkeypatch,
):
    _wire(monkeypatch, cands=_cands(0.9), reply="Proven [1], invented [9].")
    cfg = global_rag_config()

    gated = await answer_question(
        None, question="q", space_id="sp",
        layers=_layers(citation_validation=True), cfg=cfg,
    )
    assert "[9]" not in gated.answer
    assert "[1]" in gated.answer

    baseline = await answer_question(
        None, question="q", space_id="sp",
        layers=_layers(citation_validation=False), cfg=cfg,
    )
    assert "[9]" in baseline.answer  # kept — this is what hallucination flags


async def test_claim_layer_declines_through_the_shared_verify_claims(monkeypatch):
    _wire(monkeypatch, cands=_cands(0.9), reply="Mitochondria make ATP [1].")

    async def judge_all_unsupported(question, claims, evidence, config):
        from studyspace.services.rag import ClaimVerdict

        return {
            i: ClaimVerdict(index=i, supported=False, score=0.0)
            for i in range(len(claims))
        }

    monkeypatch.setattr(rag, "judge_claims", judge_all_unsupported)

    result = await answer_question(
        None, question="q", space_id="sp",
        layers=_layers(claim_verification=True), cfg=global_rag_config(),
    )

    from studyspace.services.rag import not_found_message

    assert result.status == "not_found"
    assert result.answer == not_found_message()


async def test_the_eval_prompt_is_cold_and_non_socratic(monkeypatch):
    captured = _wire(monkeypatch, cands=_cands(0.9))

    result = await answer_question(
        None, question="What is ATP?", space_id="sp",
        layers=_layers(), cfg=global_rag_config(),
    )

    system = captured["messages"][0]["content"]
    assert "Tutor mode" not in system  # the dataset expects answers
    assert "Question: What is ATP?" in captured["messages"][-1]["content"]
    assert len(captured["messages"]) == 2  # system + question, no history
    assert result.cost_usd == 0.01  # estimate is passed through


def test_cited_citations_only_maps_labels_the_answer_uses():
    cands = _cands(0.9, 0.8, 0.7)
    rows = cited_citations("Answer is here [2] and [3].", cands)
    assert [r["label"] for r in rows] == [2, 3]
    assert rows[0]["chunk_id"] == "c2"
    assert cited_citations("No markers at all.", cands) == []


# ---------------------------------------------------------------------------
# execute_run — lifecycle against the live database
# ---------------------------------------------------------------------------


def _stub_pipeline(monkeypatch, *, fail_on: str | None = None):
    async def fake_answer(conn, *, question, space_id, layers, cfg):
        if fail_on is not None and question == fail_on:
            raise RuntimeError("llm exploded")
        return EvalAnswer(
            answer="Mitochondria make ATP [1].",
            status="verified",
            candidates=_cands(0.9),
            latency_ms=7,
            cost_usd=0.01,
        )

    async def fake_scores(**kwargs):
        return {
            "faithfulness": 0.9,
            "answer_relevancy": 1.0,
            "context_precision": 0.5,
            "context_recall": 1.0,
        }

    monkeypatch.setattr(eval_runner, "answer_question", fake_answer)
    monkeypatch.setattr(eval_runner, "standard_scores", fake_scores)


async def _db(migrated_db):
    import asyncpg

    return await asyncpg.connect(dsn=migrated_db)


async def _make_space(conn, user_id: str) -> str:
    return await conn.fetchval(
        "insert into public.spaces (user_id, title) values ($1, 'Eval space') "
        "returning id",
        user_id,
    )


async def _make_run(conn, user_id: str, *, config: dict, dataset_version="v1") -> str:
    return str(
        await conn.fetchval(
            "insert into public.eval_runs "
            "(user_id, label, dataset_version, config, status) "
            "values ($1, 't', $2, $3::jsonb, 'pending') returning id",
            user_id,
            dataset_version,
            json.dumps(config),
        )
    )


async def test_execute_run_completes_and_attributes_every_row(
    monkeypatch, migrated_db, two_users
):
    _stub_pipeline(monkeypatch)
    conn = await _db(migrated_db)
    try:
        await _make_space(conn, ALICE["id"])
        run_id = await _make_run(conn, ALICE["id"], config=_TWO_CONFIGS)
    finally:
        await conn.close()

    await execute_run(run_id, ALICE["id"])

    conn = await _db(migrated_db)
    try:
        run = await conn.fetchrow(
            "select status, summary, error, started_at, finished_at "
            "from public.eval_runs where id = $1",
            run_id,
        )
        assert run["status"] == "completed"
        assert run["error"] is None
        assert run["started_at"] is not None and run["finished_at"] is not None

        rows = await conn.fetch(
            "select question_id, config, status, metrics from eval_results "
            "where run_id = $1 order by question_id, config",
            run_id,
        )
    finally:
        await conn.close()

    doc = load_dataset()
    expected_ids = {q["id"] for q in doc["questions"][:2]}
    assert len(rows) == 4  # 2 questions x 2 configs
    assert {r["question_id"] for r in rows} == expected_ids
    assert {r["config"] for r in rows} == {"baseline", "+relevance-gate"}
    assert all(r["status"] == "verified" for r in rows)

    summary = run["summary"]
    if isinstance(summary, str):
        summary = json.loads(summary)
    assert summary["total"] == 4
    assert summary["passed"] == 4
    assert summary["hallucination_rate"] == 0.0
    assert summary["faithfulness"] == 0.9
    assert summary["relevancy"] == 1.0
    assert summary["cost_usd"] == pytest.approx(0.04)  # 0.01 answer cost x4
    assert summary["avg_latency_ms"] is not None
    # during the run the summary carried progress; at the end it carries
    # the flat contract the UI reads — and nothing else
    assert set(summary) == {
        "total", "passed", "hallucination_rate", "correct_not_found_rate",
        "avg_latency_ms", "cost_usd", "faithfulness", "relevancy", "precision", "recall",
    }


async def test_results_endpoint_returns_the_config_column(
    monkeypatch, migrated_db, two_users, api_client
):
    _stub_pipeline(monkeypatch)
    monkeypatch.setenv("ADMIN_EMAILS", ALICE["email"])
    from studyspace.config import get_settings

    get_settings.cache_clear()

    conn = await _db(migrated_db)
    try:
        await _make_space(conn, ALICE["id"])
        run_id = await _make_run(conn, ALICE["id"], config=_TWO_CONFIGS)
    finally:
        await conn.close()

    await execute_run(run_id, ALICE["id"])

    resp = await api_client.get(
        f"/api/evals/runs/{run_id}/results", headers=headers_for(ALICE["id"], ALICE["email"])
    )
    assert resp.status_code == 200, resp.text
    results = resp.json()
    assert len(results) == 4
    assert {r["config"] for r in results} == {"baseline", "+relevance-gate"}
    assert all(r["metrics"]["faithfulness"] == 0.9 for r in results)


async def test_one_broken_question_becomes_failed_rows_not_a_dead_run(
    monkeypatch, migrated_db, two_users
):
    doc = load_dataset()
    second_question = doc["questions"][1]["question"]
    _stub_pipeline(monkeypatch, fail_on=second_question)
    conn = await _db(migrated_db)
    try:
        await _make_space(conn, ALICE["id"])
        run_id = await _make_run(conn, ALICE["id"], config=_TWO_CONFIGS)
    finally:
        await conn.close()

    await execute_run(run_id, ALICE["id"])

    conn = await _db(migrated_db)
    try:
        run = await conn.fetchrow(
            "select status, summary from public.eval_runs where id = $1", run_id
        )
        failed = await conn.fetch(
            "select status, metrics from eval_results where run_id = $1 and status is null",
            run_id,
        )
        total_rows = await conn.fetchval(
            "select count(*) from eval_results where run_id = $1", run_id
        )
    finally:
        await conn.close()

    assert run["status"] == "completed"  # 399-style resilience, not a dead run
    assert total_rows == 4
    assert len(failed) == 2  # the question failed under BOTH configs
    for row in failed:
        metrics = row["metrics"]
        if isinstance(metrics, str):
            metrics = json.loads(metrics)
        assert "llm exploded" in metrics["error"]

    summary = run["summary"]
    if isinstance(summary, str):
        summary = json.loads(summary)
    assert summary["total"] == 4
    assert summary["passed"] == 2
    assert summary["faithfulness"] == 0.9  # failed rows never pollute means


async def test_no_space_fails_the_run_with_an_instructive_error(
    monkeypatch, migrated_db, two_users
):
    _stub_pipeline(monkeypatch)
    conn = await _db(migrated_db)
    try:
        run_id = await _make_run(conn, BOB["id"], config=_TWO_CONFIGS)  # bob owns nothing
    finally:
        await conn.close()

    with pytest.raises(ValueError, match="no space to evaluate"):
        await execute_run(run_id, BOB["id"])

    conn = await _db(migrated_db)
    try:
        run = await conn.fetchrow(
            "select status, error from public.eval_runs where id = $1", run_id
        )
    finally:
        await conn.close()
    assert run["status"] == "failed"
    assert "create a space and ingest a source" in run["error"]


async def test_version_mismatch_fails_before_spending_anything(
    monkeypatch, migrated_db, two_users
):
    _stub_pipeline(monkeypatch)
    conn = await _db(migrated_db)
    try:
        await _make_space(conn, ALICE["id"])
        run_id = await _make_run(
            conn, ALICE["id"], config=_TWO_CONFIGS, dataset_version="v9"
        )
    finally:
        await conn.close()

    with pytest.raises(ValueError, match="packaged dataset is 'v1'"):
        await execute_run(run_id, ALICE["id"])

    conn = await _db(migrated_db)
    try:
        (status,) = await conn.fetchrow(
            "select status from public.eval_runs where id = $1", run_id
        )
        rows = await conn.fetchval(
            "select count(*) from eval_results where run_id = $1", run_id
        )
    finally:
        await conn.close()
    assert status == "failed"
    assert rows == 0  # nothing was spent before the plan died


async def test_a_retry_clears_previous_results_instead_of_doubling_them(
    monkeypatch, migrated_db, two_users
):
    _stub_pipeline(monkeypatch)
    conn = await _db(migrated_db)
    try:
        await _make_space(conn, ALICE["id"])
        run_id = await _make_run(conn, ALICE["id"], config=_TWO_CONFIGS)
    finally:
        await conn.close()

    await execute_run(run_id, ALICE["id"])
    await execute_run(run_id, ALICE["id"])  # arq's second try

    conn = await _db(migrated_db)
    try:
        rows = await conn.fetchval(
            "select count(*) from eval_results where run_id = $1", run_id
        )
        (status,) = await conn.fetchrow(
            "select status from public.eval_runs where id = $1", run_id
        )
    finally:
        await conn.close()
    assert rows == 4  # not 8
    assert status == "completed"


async def test_progress_summary_advances_while_the_run_is_in_flight(
    monkeypatch, migrated_db, two_users
):
    """What AdminEvals polls: status running, and a done count that grows.

    Sequential (concurrency 1) so the reads are deterministic: each task
    reads the run row before it writes its own, so task N sees N rows
    already committed and counted.
    """
    from types import SimpleNamespace

    conn = await _db(migrated_db)
    try:
        await _make_space(conn, ALICE["id"])
        run_id = await _make_run(conn, ALICE["id"], config=_TWO_CONFIGS)
    finally:
        await conn.close()

    observed: list[dict] = []

    async def fake_answer(conn, *, question, space_id, layers, cfg):
        row = await conn.fetchrow(
            "select status, summary from public.eval_runs where id = $1", run_id
        )
        summary = row["summary"]
        if isinstance(summary, str):
            summary = json.loads(summary)
        observed.append({"status": row["status"], **summary})
        return EvalAnswer(
            answer="Mitochondria make ATP [1].",
            status="verified",
            candidates=_cands(0.9),
            latency_ms=7,
            cost_usd=0.01,
        )

    async def fake_scores(**kwargs):
        return {
            "faithfulness": 0.9,
            "answer_relevancy": 1.0,
            "context_precision": 0.5,
            "context_recall": 1.0,
        }

    monkeypatch.setattr(eval_runner, "answer_question", fake_answer)
    monkeypatch.setattr(eval_runner, "standard_scores", fake_scores)
    monkeypatch.setattr(
        eval_runner, "get_settings", lambda: SimpleNamespace(eval_concurrency=1)
    )

    await execute_run(run_id, ALICE["id"])

    assert [o["status"] for o in observed] == ["running"] * 4
    assert [o["done"] for o in observed] == [0, 1, 2, 3]  # rows committed, not guesses
    assert [o["total"] for o in observed] == [4, 4, 4, 4]

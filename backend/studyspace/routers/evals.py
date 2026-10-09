"""Evaluation endpoints (admin only) — runs are executed by the ARQ worker
so long suites don't block the API."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException

from studyspace.deps import AdminDep, DbDep
from studyspace.models.evals import (
    DEFAULT_CONFIGS,
    EvalResultOut,
    EvalRunCreate,
    EvalRunOut,
)
from studyspace.queue import get_queue

router = APIRouter(prefix="/evals", tags=["evals"])


@router.post("/run", response_model=EvalRunOut, status_code=201)
async def start_run(body: EvalRunCreate, db: DbDep, admin: AdminDep) -> EvalRunOut:
    configs = [c.model_dump() for c in body.configs] or DEFAULT_CONFIGS
    row = await db.fetchrow(
        "insert into public.eval_runs (user_id, label, dataset_version, config, status) "
        "values ($1, $2, $3, $4, 'pending') returning id, label, dataset_version, config, status, "
        "summary, error, started_at, finished_at, created_at",
        admin.id, body.label, body.dataset_version,
        json.dumps({"configs": configs, "limit": body.limit}),
    )
    try:
        queue = await get_queue()
        await queue.enqueue_job(
            "run_evals", str(row["id"]), admin.id,
            _job_id=f"evals:{row['id']}",
        )
    except Exception as exc:
        # The request runs in one transaction (deps.user_conn), so the
        # 503 below rolls back the run insert along with everything
        # else: nothing was enqueued, so nothing persists either —
        # marking the row 'failed' here could never be observed.
        raise HTTPException(status_code=503, detail="Job queue unavailable.") from exc
    return _run_out(row)


def _run_out(row) -> EvalRunOut:
    config = row["config"]
    summary = row["summary"]
    return EvalRunOut(
        id=row["id"],
        label=row["label"],
        dataset_version=row["dataset_version"],
        config=json.loads(config) if isinstance(config, str) else config,
        status=row["status"],
        summary=json.loads(summary) if isinstance(summary, str) else summary,
        error=row["error"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        created_at=row["created_at"],
    )


@router.get("/runs", response_model=list[EvalRunOut])
async def list_runs(db: DbDep, admin: AdminDep, limit: int = 30) -> list[EvalRunOut]:
    rows = await db.fetch(
        "select id, label, dataset_version, config, status, summary, error, started_at, finished_at, created_at "
        "from public.eval_runs where user_id = auth.uid() order by created_at desc limit $1",
        min(max(limit, 1), 100),
    )
    return [_run_out(r) for r in rows]


@router.get("/runs/{run_id}/results", response_model=list[EvalResultOut])
async def get_results(db: DbDep, admin: AdminDep, run_id: uuid.UUID) -> list[EvalResultOut]:
    rows = await db.fetch(
        "select id, run_id, question_id, config, question, kind, answer, reference, status, metrics, created_at "
        "from public.eval_results where run_id = $1 and user_id = auth.uid() order by question_id, config",
        run_id,
    )
    out = []
    for r in rows:
        metrics = r["metrics"]
        out.append(
            EvalResultOut(
                id=r["id"], run_id=r["run_id"], question_id=r["question_id"],
                config=r["config"], question=r["question"], kind=r["kind"],
                answer=r["answer"],
                reference=r["reference"], status=r["status"],
                metrics=json.loads(metrics) if isinstance(metrics, str) else metrics,
                created_at=r["created_at"],
            )
        )
    return out

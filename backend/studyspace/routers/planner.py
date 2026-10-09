"""Planner endpoints: start a run, inspect the proposal (ghost tasks),
approve (optionally edited) or reject. Nothing is committed before approval.
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException

from studyspace.db import user_conn
from studyspace.deps import DbDep, UserDep
from studyspace.models.planner import (
    PlannerApprove,
    PlannerRunCreate,
    PlannerRunOut,
    PlanTaskOut,
)
from studyspace.services.checkpoints import PostgresCheckpointer
from studyspace.services.planner import resume_run, start_run

router = APIRouter(prefix="/planner", tags=["planner"])

_RUN_SELECT = (
    "select id, status, input, proposal, plan_id, error, created_at, updated_at "
    "from public.planner_runs where id = $1 and user_id = auth.uid()"
)


def _parse_json(value, default):
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default


def _run_out(row) -> PlannerRunOut:
    proposal = _parse_json(row["proposal"], None)
    return PlannerRunOut(
        id=row["id"],
        status=row["status"],
        input=_parse_json(row["input"], {}),
        proposal=proposal,
        plan_id=row["plan_id"],
        error=row["error"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("/runs", response_model=PlannerRunOut, status_code=201)
async def create_run(body: PlannerRunCreate, db: DbDep, user: UserDep) -> PlannerRunOut:
    spec = body.model_dump(mode="json")
    run_id = await db.fetchval(
        "insert into public.planner_runs (user_id, status, input) values (auth.uid(), 'running', $1) returning id",
        json.dumps(spec),
    )

    conn_factory = lambda: user_conn(user.claims)  # noqa: E731
    checkpointer = PostgresCheckpointer(conn_factory, user.id)
    try:
        state = await start_run(
            conn_factory=conn_factory,
            checkpointer=checkpointer,
            thread_id=str(run_id),
            user_id=user.id,
            spec=spec,
        )
    except Exception as exc:  # noqa: BLE001
        await db.execute(
            "update public.planner_runs set status = 'failed', error = $2 where id = $1",
            run_id, str(exc)[:500],
        )
        raise HTTPException(status_code=502, detail="Planning failed — please try again.") from exc

    interrupt_payload = state.get("__interrupt__")
    proposal = state.get("proposal")
    if not proposal and not interrupt_payload:
        await db.execute(
            "update public.planner_runs set status = 'failed', error = $2 where id = $1",
            run_id, "No proposal was generated.",
        )
        raise HTTPException(status_code=502, detail="No plan was proposed. Try adding exam dates or topics.")

    await db.execute(
        "update public.planner_runs set status = 'awaiting_approval', proposal = $2 where id = $1",
        run_id, json.dumps(proposal or {}),
    )
    row = await db.fetchrow(_RUN_SELECT, run_id)
    return _run_out(row)


@router.get("/runs", response_model=list[PlannerRunOut])
async def list_runs(db: DbDep) -> list[PlannerRunOut]:
    rows = await db.fetch(
        "select id, status, input, proposal, plan_id, error, created_at, updated_at "
        "from public.planner_runs where user_id = auth.uid() order by created_at desc limit 30"
    )
    return [_run_out(r) for r in rows]


@router.post("/runs/{run_id}/approve", response_model=PlannerRunOut)
async def approve_run(db: DbDep, user: UserDep, run_id: uuid.UUID, body: PlannerApprove) -> PlannerRunOut:
    row = await db.fetchrow(_RUN_SELECT, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    if row["status"] != "awaiting_approval":
        raise HTTPException(status_code=409, detail=f"Run is '{row['status']}', not awaiting approval.")

    proposal = _parse_json(row["proposal"], {}) or {}
    tasks: list[dict] = []
    if body.tasks is not None:
        tasks = [t.model_dump(mode="json") for t in body.tasks]
    else:
        tasks = list(proposal.get("tasks", []))
    if not tasks:
        raise HTTPException(status_code=400, detail="Approve with at least one task.")

    conn_factory = lambda: user_conn(user.claims)  # noqa: E731
    checkpointer = PostgresCheckpointer(conn_factory, user.id)
    try:
        state = await resume_run(
            conn_factory=conn_factory,
            checkpointer=checkpointer,
            thread_id=str(run_id),
            user_id=user.id,
            decision={"approved": True, "tasks": tasks, "plan_title": body.plan_title},
        )
    except Exception as exc:  # noqa: BLE001
        await db.execute(
            "update public.planner_runs set status = 'failed', error = $2 where id = $1",
            run_id, str(exc)[:500],
        )
        raise HTTPException(status_code=502, detail="Committing the plan failed.") from exc

    plan_id = state.get("plan_id")
    status = state.get("status", "approved")
    await db.execute(
        "update public.planner_runs set status = $2, plan_id = $3 where id = $1",
        run_id, status, plan_id,
    )
    updated = await db.fetchrow(_RUN_SELECT, run_id)
    return _run_out(updated)


@router.post("/runs/{run_id}/reject", response_model=PlannerRunOut)
async def reject_run(db: DbDep, user: UserDep, run_id: uuid.UUID) -> PlannerRunOut:
    row = await db.fetchrow(_RUN_SELECT, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    if row["status"] != "awaiting_approval":
        raise HTTPException(status_code=409, detail=f"Run is '{row['status']}', not awaiting approval.")

    conn_factory = lambda: user_conn(user.claims)  # noqa: E731
    checkpointer = PostgresCheckpointer(conn_factory, user.id)
    try:
        await resume_run(
            conn_factory=conn_factory,
            checkpointer=checkpointer,
            thread_id=str(run_id),
            user_id=user.id,
            decision={"approved": False},
        )
    except Exception:
        pass  # rejection still marks the run rejected even if the graph errors

    await db.execute(
        "update public.planner_runs set status = 'rejected' where id = $1", run_id
    )
    updated = await db.fetchrow(_RUN_SELECT, run_id)
    return _run_out(updated)


# ---------------------------------------------------------------------------
# Committed plan tasks
# ---------------------------------------------------------------------------

@router.get("/tasks", response_model=list[PlanTaskOut])
async def list_tasks(db: DbDep, include_done: bool = False) -> list[PlanTaskOut]:
    rows = await db.fetch(
        "select pt.id, pt.plan_id, pt.title, pt.topic, pt.due, pt.duration_min, pt.space_id, "
        "pt.status, pt.source, pt.order_idx, pt.created_at, pt.updated_at "
        "from public.plan_tasks pt join public.plans p on p.id = pt.plan_id "
        "where pt.user_id = auth.uid() and p.status = 'active' "
        "and ($1 or pt.status = 'pending') "
        "order by pt.due nulls last, pt.order_idx",
        include_done,
    )
    return [PlanTaskOut(**dict(r)) for r in rows]


@router.patch("/tasks/{task_id}", response_model=PlanTaskOut)
async def update_task(task_id: uuid.UUID, body: dict, db: DbDep) -> PlanTaskOut:
    allowed = {}
    if "status" in body and body["status"] in ("pending", "done", "skipped"):
        allowed["status"] = body["status"]
    if "title" in body and str(body["title"]).strip():
        allowed["title"] = str(body["title"]).strip()[:300]
    if "due" in body:
        allowed["due"] = body["due"] or None
    if "duration_min" in body:
        try:
            allowed["duration_min"] = min(max(int(body["duration_min"]), 5), 600)
        except (TypeError, ValueError):
            pass
    if not allowed:
        raise HTTPException(status_code=400, detail="No valid fields to update.")
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(allowed))
    row = await db.fetchrow(
        f"update public.plan_tasks set {sets} where id = $1 and user_id = auth.uid() returning *",
        task_id, *allowed.values(),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return PlanTaskOut(**dict(row))


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, db: DbDep) -> None:
    result = await db.execute(
        "delete from public.plan_tasks where id = $1 and user_id = auth.uid()", task_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Task not found.")

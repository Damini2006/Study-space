"""POST /evals/run: the seam where the API hands a run to the worker.

The route is the only place that knows the job's name and argument
order; if either drifts, arq queues a job no function consumes and the
run sits on "pending" forever. These tests pin that handoff, and the
failure path: a dead queue must fail the run visibly instead of
leaving it pending with nothing to execute it.
"""

from __future__ import annotations

import asyncpg
from conftest import headers_for

import studyspace.routers.evals as evals_router
from studyspace.models.evals import DEFAULT_CONFIGS

ALICE = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "email": "alice@test.dev"}
BOB = {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "email": "bob@test.dev"}


class _Queue:
    def __init__(self) -> None:
        self.calls: list[tuple[tuple, dict]] = []

    async def enqueue_job(self, *args, **kwargs) -> None:
        self.calls.append((args, kwargs))


def _as_admin(monkeypatch) -> None:
    from studyspace.config import get_settings

    monkeypatch.setenv("ADMIN_EMAILS", ALICE["email"])
    get_settings.cache_clear()


async def test_start_run_enqueues_the_registered_job_with_run_and_user(
    monkeypatch, migrated_db, two_users, api_client
):
    _as_admin(monkeypatch)
    queue = _Queue()

    async def fake_get_queue():
        return queue

    monkeypatch.setattr(evals_router, "get_queue", fake_get_queue)

    denied = await api_client.post(
        "/api/evals/run",
        json={"label": "probe"},
        headers=headers_for(BOB["id"], BOB["email"]),
    )
    assert denied.status_code == 403  # admin-only, and nothing enqueued
    assert queue.calls == []

    resp = await api_client.post(
        "/api/evals/run",
        json={"label": "probe"},
        headers=headers_for(ALICE["id"], ALICE["email"]),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    assert len(queue.calls) == 1
    args, kwargs = queue.calls[0]
    assert args == ("run_evals", body["id"], ALICE["id"])
    assert kwargs == {"_job_id": f"evals:{body['id']}"}
    assert body["status"] == "pending"
    # a run with no configs plans the full ablation ladder
    assert [c["name"] for c in body["config"]["configs"]] == [
        c["name"] for c in DEFAULT_CONFIGS
    ]
    assert body["config"]["limit"] is None


async def test_a_dead_queue_creates_nothing_and_says_why(
    monkeypatch, migrated_db, two_users, api_client
):
    _as_admin(monkeypatch)

    async def broken_get_queue():
        raise RuntimeError("redis gone")

    monkeypatch.setattr(evals_router, "get_queue", broken_get_queue)

    resp = await api_client.post(
        "/api/evals/run",
        json={"label": "probe"},
        headers=headers_for(ALICE["id"], ALICE["email"]),
    )
    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"] == "Job queue unavailable."

    conn = await asyncpg.connect(dsn=migrated_db)
    try:
        count = await conn.fetchval(
            "select count(*) from public.eval_runs where user_id = $1",
            ALICE["id"],
        )
    finally:
        await conn.close()
    # the request transaction rolls back with the 503: no run was
    # enqueued, so no run may linger either — a half-open "pending"
    # row with nothing to execute it is the failure mode being avoided
    assert count == 0

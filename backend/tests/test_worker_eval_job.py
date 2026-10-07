"""The arq side of run_evals: what the job does, and that a worker picks it up.

main.py imports pypdf/pdfplumber at module load — worker-only deps this
environment does not install — so it cannot be imported here. Its two
structural claims (WorkerSettings registers the job, and the timeout
outlives a full suite) are therefore pinned by parsing the source. The
job itself lives in eval_jobs.py, which imports nothing but studyspace,
so it is executed for real against a stubbed execute_run.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

_WORKER_DIR = Path(__file__).resolve().parents[2] / "worker"
_WORKER_MAIN = _WORKER_DIR / "studyspace_worker" / "main.py"


def _eval_jobs():
    # worker/ on the path so `studyspace_worker` resolves without
    # installing the worker package (and its heavy deps) here
    if str(_WORKER_DIR) not in sys.path:
        sys.path.insert(0, str(_WORKER_DIR))
    from studyspace_worker import eval_jobs

    return eval_jobs


def _worker_source() -> str:
    return _WORKER_MAIN.read_text(encoding="utf-8")


def _settings_assign(name: str) -> ast.expr | None:
    """The value bound to `name` inside class WorkerSettings, or None."""
    tree = ast.parse(_worker_source())
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "WorkerSettings":
            for stmt in node.body:
                if isinstance(stmt, ast.Assign) and any(
                    isinstance(target, ast.Name) and target.id == name
                    for target in stmt.targets
                ):
                    return stmt.value
    return None


async def test_run_evals_delegates_run_and_user_to_the_runner(monkeypatch):
    jobs = _eval_jobs()
    seen: list[tuple[str, str]] = []

    async def fake_execute(run_id, user_id):
        seen.append((run_id, user_id))

    monkeypatch.setattr(jobs, "execute_run", fake_execute)

    assert await jobs.run_evals({}, "run-123", "user-456") is None
    assert seen == [("run-123", "user-456")]


async def test_run_evals_lets_failures_reach_arq(monkeypatch):
    jobs = _eval_jobs()

    async def boom(run_id, user_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(jobs, "execute_run", boom)

    with pytest.raises(RuntimeError, match="db down"):
        await jobs.run_evals({}, "r", "u")


def test_the_worker_actually_consumes_run_evals():
    functions = _settings_assign("functions")
    assert functions is not None and isinstance(functions, ast.List), (
        "WorkerSettings.functions is gone"
    )
    registered = {e.id for e in functions.elts if isinstance(e, ast.Name)}
    assert "run_evals" in registered, "no worker will ever pick the job up"

    # the registered name must be bound too: imported or defined inline
    tree = ast.parse(_worker_source())
    imported = any(
        isinstance(node, ast.ImportFrom)
        and any(alias.name == "run_evals" for alias in node.names)
        for node in ast.walk(tree)
    )
    defined = any(
        isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "run_evals"
        for node in tree.body
    )
    assert imported or defined, "run_evals is registered but never defined"


def test_job_timeout_outlives_the_largest_possible_suite():
    value = _settings_assign("job_timeout")
    assert isinstance(value, ast.Constant), "job_timeout is no longer a literal"
    # 200 questions x 8 configs = 1600 results; at eval_concurrency=4 and
    # ~10-15s each that is 67-100 minutes of wall clock arq must not cut
    # off — the run row would be stuck on "running" forever.
    assert value.value >= 7200, f"job_timeout={value.value} abandons real runs"

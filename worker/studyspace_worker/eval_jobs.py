"""Worker jobs whose only dependency is the backend package.

Kept out of main.py on purpose: that module pulls in pypdf/pdfplumber at
import time (worker-only dependencies the backend environment does not
install), while this job's entire substance is a call into
studyspace.services.eval_runner. The split lets the backend test suite
import the job and exercise its delegation directly instead of reading
it off the page.
"""

from __future__ import annotations

from studyspace.services.eval_runner import execute_run
from studyspace.tracing import span as trace_span


async def run_evals(ctx: dict, run_id: str, user_id: str) -> None:
    """Run one admin eval suite; execute_run owns the run's status.

    Retries are safe by construction: execute_run clears the run's
    existing results on entry, so arq's max_tries re-runs restart the
    suite instead of doubling rows. Failures propagate so arq records
    the job as failed after its retries rather than reporting success.
    """
    with trace_span("worker.eval_run", metadata={"run_id": run_id}) as sp:
        try:
            await execute_run(run_id, user_id)
        except Exception as exc:
            sp.set_output({"error": str(exc)[:300]})
            raise
        sp.set_output({"run_id": run_id, "status": "completed"})

__all__ = ["run_evals"]

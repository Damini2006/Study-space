"""The database gate itself: skip on a laptop, fail in CI.

``migrated_db``'s skip is a convenience for machines without Postgres —
and a liability in CI, where an unreachable database would silently
empty the integration suite (exactly how ``hybrid_search``'s q.query
bug could ship green: no database, no execution, no failure). These
tests pin both branches of the decision against a port nothing answers
on, capturing the outcome **by exception name** rather than with
``pytest.raises`` — a branch collapsing into the other would otherwise
surface as this test itself skipping, which is green.
"""

from __future__ import annotations

from conftest import _DB_PROBE, _require_reachable_database

DEAD = "postgresql://postgres:postgres@localhost:1/nothing_listens_here"


async def _gate_outcome(monkeypatch, *, ci: bool) -> tuple[str, str]:
    """Run the gate against a dead DSN; Skipped/Failed are BaseExceptions."""
    if ci:
        monkeypatch.setenv("CI", "true")
    else:
        monkeypatch.delenv("CI", raising=False)
    _DB_PROBE.pop(DEAD, None)
    try:
        await _require_reachable_database(DEAD)
    except BaseException as exc:  # noqa: BLE001 — the outcome IS the assertion
        return type(exc).__name__, str(exc)
    return "passed", ""


async def test_no_database_is_a_skip_off_ci(monkeypatch):
    outcome, message = await _gate_outcome(monkeypatch, ci=False)
    assert outcome == "Skipped", f"expected a skip, got {outcome}: {message}"
    # the skip tells a laptop exactly what to run
    assert "docker compose up -d postgres" in message


async def test_no_database_is_a_failure_under_ci(monkeypatch):
    """CI provisions the database; if it is gone the gate goes red rather
    than skipping its way to a hollow green run."""
    outcome, message = await _gate_outcome(monkeypatch, ci=True)
    assert outcome == "Failed", f"expected a failure, got {outcome}: {message}"
    assert "CI expected a database" in message


async def test_migrated_db_gates_before_it_migrates(monkeypatch):
    """The fixture stays a thin wrapper — gate first, migrations second —
    so the CI-fail branch cannot be quietly disconnected from the suite."""
    import conftest

    seen: list[str] = []

    async def fake_gate(url: str) -> None:
        seen.append(f"gate:{url}")

    async def fake_apply(url: str) -> None:
        seen.append(f"apply:{url}")

    monkeypatch.setattr(conftest, "_require_reachable_database", fake_gate)
    monkeypatch.setattr(conftest, "_apply_migrations", fake_apply)

    out = await conftest.migrated_db.__wrapped__("db://example")
    assert out == "db://example"
    assert seen == ["gate:db://example", "apply:db://example"]

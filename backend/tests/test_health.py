"""Health: liveness answers for the process, readiness for the database."""

from __future__ import annotations

import asyncio
import re

from studyspace.db import database_reachable, set_pool


async def test_liveness_is_static_and_needs_no_database(api_client):
    """Passing here is the proof it never touched the database: the unit
    environment has no pool, and this request still succeeds."""
    response = await api_client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "studyspace-api"}
    # Correlation comes for free — the middleware covers this route too.
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["X-Request-Id"])


async def test_readiness_reports_down_without_a_pool(api_client):
    """The unit environment is the failure case by construction, so this
    asserts the honest answer: 503 and db=down, not a crash and not a lie."""
    response = await api_client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "service": "studyspace-api",
        "db": "down",
    }


async def test_readiness_reports_up_for_a_healthy_pool(api_client):
    class FakePool:
        async def fetchval(self, *args, **kwargs):
            return 1

    set_pool(FakePool())
    try:
        response = await api_client.get("/api/health/ready")
    finally:
        set_pool(None)

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "service": "studyspace-api",
        "db": "up",
    }


async def test_readiness_has_its_own_clock_when_the_database_hangs():
    """A hung database must not hang the probe.

    The check carries a timeout of its own, so the answer arrives either
    way. Remove the timeout and this test sleeps the pool's full ten
    seconds and then wrongly reports ready.
    """

    class HangingPool:
        async def fetchval(self, *args, **kwargs):
            await asyncio.sleep(10)
            return 1

    assert await database_reachable(HangingPool(), timeout=0.05) is False

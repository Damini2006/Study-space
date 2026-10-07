"""Vitals: one INFO line per page load, nothing stored."""

from __future__ import annotations

import logging

import pytest

from studyspace.rate_limit import RateLimitResult
from studyspace.routers import telemetry as telemetry_module

LOGGER = "studyspace.vitals"

# A real-shaped HS256 token, to prove routes get scrubbed like messages do.
TOKEN = (
    "eyJhbGciOiJIUzI1NiJ9."
    "eyJzdWIiOiJhLWEtYS1hLWEtYS1hLWEiLCJleHAiOjF9."
    "abcdef123456"
)


def _vitals_records(caplog):
    return [record for record in caplog.records if record.name == LOGGER]


async def test_vitals_are_logged_as_one_correlated_line(api_client, caplog):
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.post(
            "/api/vitals",
            json={
                "fcp_ms": 604.8,
                "lcp_ms": 900.4,
                "cls": 0.042,
                "route": f"/app/{TOKEN}",
            },
        )

    assert response.status_code == 204
    [record] = _vitals_records(caplog)
    assert record.levelno == logging.INFO
    message = record.getMessage()
    assert "fcp_ms=604.8" in message
    assert "lcp_ms=900.4" in message
    assert "cls=0.042" in message
    assert "route=/app/[redacted-jwt]" in message
    assert TOKEN not in message
    assert f"request_id={response.headers['X-Request-Id']}" in message


async def test_missing_metrics_log_as_none(api_client, caplog):
    """A browser that observed nothing says so — `none` is an answer too."""
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.post("/api/vitals", json={})

    assert response.status_code == 204
    [record] = _vitals_records(caplog)
    message = record.getMessage()
    assert "fcp_ms=none" in message
    assert "lcp_ms=none" in message
    assert "cls=none" in message


async def test_a_bad_but_real_page_is_still_a_data_point(api_client, caplog):
    """CLS above 1 is a genuinely terrible page — exactly the data worth
    keeping, so the sanity range has to allow it through."""
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.post("/api/vitals", json={"cls": 1.2})

    assert response.status_code == 204
    assert "cls=1.2" in _vitals_records(caplog)[0].getMessage()


@pytest.mark.parametrize(
    "body",
    [
        {"fcp_ms": -1},
        {"cls": -0.5},
        {"cls": 10.5},
        {"lcp_ms": 3_600_001},
    ],
)
async def test_impossible_vitals_are_rejected(api_client, body):
    response = await api_client.post("/api/vitals", json=body)
    assert response.status_code == 422


async def test_vitals_floods_are_rate_limited(api_client, caplog, monkeypatch):
    async def deny(*args, **kwargs):
        return RateLimitResult(allowed=False, remaining=0, retry_after=7)

    monkeypatch.setattr(telemetry_module, "rate_limit", deny)
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.post("/api/vitals", json={"fcp_ms": 100})

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "7"
    # Rejected before logging: a flood must not become a flood of log lines.
    assert _vitals_records(caplog) == []

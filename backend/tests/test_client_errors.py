"""Client error reports: accepted, scrubbed, capped, and rate-limited."""

from __future__ import annotations

import logging

import pytest

from studyspace.rate_limit import RateLimitResult
from studyspace.routers import telemetry as telemetry_module

LOGGER = "studyspace.client"

# A real-shaped HS256 token: eyJ header, eyJ claim, base64url signature.
TOKEN = (
    "eyJhbGciOiJIUzI1NiJ9."
    "eyJzdWIiOiJhLWEtYS1hLWEtYS1hLWEtYS1hLWEtYS1hLWEiLCJleHAiOjF9."
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c"
)


def _error_records(caplog):
    return [record for record in caplog.records if record.name == LOGGER]


async def test_report_is_accepted_logged_scrubbed_and_correlated(api_client, caplog):
    body = {
        "message": f"boom while calling with {TOKEN}",
        "stack": (
            "TypeError: x is undefined\n"
            "    at render (http://localhost/assets/index.js:1:1)\n"
            "    at authorized Bearer abcdef123456"
        ),
        "route": "/app/notes/123",
        "source": "uncaught",
    }
    with caplog.at_level(logging.ERROR, logger=LOGGER):
        response = await api_client.post("/api/client-errors", json=body)

    assert response.status_code == 204

    [record] = _error_records(caplog)
    assert record.levelno == logging.ERROR
    message = record.getMessage()
    assert "source=uncaught" in message
    assert "route=/app/notes/123" in message
    assert "TypeError" in message

    # Credentials never reach the log, whatever the browser quoted.
    assert TOKEN not in message
    assert "abcdef123456" not in message
    assert "[redacted-jwt]" in message
    assert "Bearer [redacted]" in message

    # One line: the stack was flattened, not pasted in.
    assert "\n" not in message

    # Same id as the response header, so this record joins the request's
    # own access line in the request log.
    assert f"request_id={response.headers['X-Request-Id']}" in message


async def test_long_but_plausible_reports_are_truncated_not_rejected(api_client, caplog):
    """Truncation keeps the report; a 422 would throw away exactly the
    long stack that was worth sending."""
    with caplog.at_level(logging.ERROR, logger=LOGGER):
        response = await api_client.post(
            "/api/client-errors",
            json={"message": "M" * 4000, "stack": "S" * 9000},
        )

    assert response.status_code == 204
    [record] = _error_records(caplog)
    message = record.getMessage()
    # Uppercase is the payload; every key in the line is lowercase.
    assert message.count("M") == 500
    assert message.count("S") == 4000


@pytest.mark.parametrize(
    "body",
    [
        {},  # message is required
        {"message": "x", "source": "whatever"},  # source is a closed set
        {"message": "M" * 20_001},  # absurd sizes stop before scrubbing
    ],
)
async def test_malformed_reports_are_rejected(api_client, body):
    response = await api_client.post("/api/client-errors", json=body)
    assert response.status_code == 422


async def test_flooded_reports_are_rejected_with_retry_after(api_client, caplog, monkeypatch):
    async def deny(*args, **kwargs):
        return RateLimitResult(allowed=False, remaining=0, retry_after=42)

    monkeypatch.setattr(telemetry_module, "rate_limit", deny)
    with caplog.at_level(logging.ERROR, logger=LOGGER):
        response = await api_client.post("/api/client-errors", json={"message": "x"})

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "42"
    # Rejected before logging: a flood must not become a flood of log lines.
    assert _error_records(caplog) == []

"""The request log: one correlated line per request, no query strings."""

from __future__ import annotations

import logging
import re

import pytest

from studyspace.request_log import configure_logging, logfmt, new_request_id

LOGGER = "studyspace.request"


def _records(caplog):
    return [record for record in caplog.records if record.name == LOGGER]


async def test_ok_request_gets_one_info_line_and_a_header_id(api_client, caplog):
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.get("/api/health")

    assert response.status_code == 200
    header_id = response.headers["X-Request-Id"]
    assert re.fullmatch(r"[0-9a-f]{32}", header_id)

    [record] = _records(caplog)
    assert record.levelno == logging.INFO
    message = record.getMessage()
    assert "method=GET" in message
    assert "path=/api/health" in message
    assert "status=200" in message
    assert "duration_ms=" in message
    # The line carries exactly the id the client was handed back.
    assert f"request_id={header_id}" in message


async def test_query_strings_never_reach_the_log(api_client, caplog):
    with caplog.at_level(logging.INFO, logger=LOGGER):
        await api_client.get("/api/health?access_token=TOP-SECRET-VALUE")

    [record] = _records(caplog)
    message = record.getMessage()
    # The path is ours; the query string is where other people's tokens end up.
    assert "TOP-SECRET-VALUE" not in message
    assert "path=/api/health" in message


async def test_inbound_id_is_honoured_when_it_looks_like_one(api_client, caplog):
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.get(
            "/api/health", headers={"X-Request-Id": "client-abc.123"}
        )

    assert response.headers["X-Request-Id"] == "client-abc.123"
    [record] = _records(caplog)
    assert "request_id=client-abc.123" in record.getMessage()


@pytest.mark.parametrize("bogus", ["a b", "x" * 200])
async def test_inbound_id_that_looks_injection_is_replaced(api_client, caplog, bogus):
    """Spaces and over-long values are user input, and this value goes to logs."""
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.get("/api/health", headers={"X-Request-Id": bogus})

    replaced = response.headers["X-Request-Id"]
    assert replaced != bogus
    assert re.fullmatch(r"[0-9a-f]{32}", replaced)


@pytest.mark.parametrize("path, expect_status", [("/api/does-not-exist", 404), ("/api/me", 401)])
async def test_client_faults_are_logged_as_warnings(api_client, caplog, path, expect_status):
    with caplog.at_level(logging.INFO, logger=LOGGER):
        response = await api_client.get(path)

    assert response.status_code == expect_status
    [record] = _records(caplog)
    assert record.levelno == logging.WARNING
    assert f"status={expect_status}" in record.getMessage()


async def test_unhandled_failure_returns_a_correlated_500(caplog):
    """A crash becomes a 500 the frontend can parse, carrying an id that
    matches a traceback record and an access line in the log — and nothing
    else. The exception message stays out of the body.

    The route lives only in this test's app: raising is its whole job, so
    what happens here does not depend on the database being present.
    """
    from httpx import ASGITransport, AsyncClient

    from studyspace.main import create_app

    app = create_app()

    @app.get("/boom")
    async def boom():
        raise ValueError("kaboom")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with caplog.at_level(logging.INFO, logger=LOGGER):
            response = await client.get("/boom")

    assert response.status_code == 500
    payload = response.json()
    assert payload["detail"] == "Internal server error"
    assert "kaboom" not in response.text

    # Header and body agree, and both appear in the two records the request
    # produced: the traceback first, then the access line.
    header_id = response.headers["X-Request-Id"]
    assert payload["request_id"] == header_id

    traceback_record, access_record = _records(caplog)
    assert traceback_record.exc_info is not None
    assert traceback_record.exc_info[0] is ValueError
    assert f"request_id={header_id}" in traceback_record.getMessage()
    assert access_record.levelno == logging.ERROR
    assert "status=500" in access_record.getMessage()
    assert "path=/boom" in access_record.getMessage()
    assert "exception=ValueError" in access_record.getMessage()
    assert f"request_id={header_id}" in access_record.getMessage()


def test_logfmt_quotes_values_that_could_break_the_line():
    assert logfmt(method="GET", path="/a b") == 'method=GET path="/a b"'
    assert logfmt(note='say "hi"') == 'note="say \\"hi\\""'
    assert logfmt(plain="ok", empty="") == "plain=ok empty="


def test_generated_ids_are_unique_and_uniform():
    ids = {new_request_id() for _ in range(100)}
    assert len(ids) == 100
    assert all(re.fullmatch(r"[0-9a-f]{32}", identifier) for identifier in ids)


def test_configure_logging_installs_a_handler_once(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    from studyspace.config import get_settings

    get_settings.cache_clear()
    root = logging.getLogger()
    saved_handlers, saved_level = list(root.handlers), root.level
    root.handlers = []
    try:
        configure_logging()
        assert len(root.handlers) == 1
        assert root.level == logging.INFO
        configure_logging()  # idempotent: never stacks handlers
        assert len(root.handlers) == 1
    finally:
        root.handlers[:] = saved_handlers
        root.setLevel(saved_level)
        get_settings.cache_clear()


def test_configure_logging_honours_the_level_setting(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    from studyspace.config import get_settings

    get_settings.cache_clear()
    root = logging.getLogger()
    saved_handlers, saved_level = list(root.handlers), root.level
    root.handlers = []
    try:
        configure_logging()
        assert root.level == logging.WARNING
    finally:
        root.handlers[:] = saved_handlers
        root.setLevel(saved_level)
        get_settings.cache_clear()


def test_configure_logging_leaves_the_hosts_configuration_alone():
    root = logging.getLogger()
    saved_handlers, saved_level = list(root.handlers), root.level
    root.handlers = []
    sentinel = logging.NullHandler()
    root.addHandler(sentinel)
    try:
        configure_logging()
        assert root.handlers == [sentinel]
        assert root.level == saved_level
    finally:
        root.handlers[:] = saved_handlers
        root.setLevel(saved_level)

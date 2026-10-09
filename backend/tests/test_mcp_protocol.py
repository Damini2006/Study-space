"""The /mcp surface: no live token, no study data.

The MCP app mounted exactly as ``create_app`` mounts it, spoken to with
the mcp SDK's real SSE client against a stub backend — no database, so
these run in CI where the integration suite skips. They pin the promises
the Settings panel makes about tokens:

* connecting without a live token is refused at the door (SSE *and*
  the message endpoint);
* tools run as the token's owner and forward that same token to the
  API, where deps re-verifies it and RLS applies;
* the read/write checkboxes gate exactly the tools they name;
* one holder's caller context never bleeds into another's session.
"""

from __future__ import annotations

import contextlib
import json
import socket
import threading
import time

import httpx
import pytest
import uvicorn
from fastapi import FastAPI, Request
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

from studyspace.mcp_auth import PatIdentity

TOKENS = {
    "ssk_read": PatIdentity("user-1", frozenset({"read"})),
    "ssk_write": PatIdentity("user-1", frozenset({"write"})),
    "ssk_full": PatIdentity("user-2", frozenset({"read", "write"})),
}


async def _fake_verify_pat(token: str) -> PatIdentity | None:
    return TOKENS.get(token)


def _stub_backend() -> FastAPI:
    """The API surface the tools call, echoing what each hop carried."""
    app = FastAPI()

    @app.get("/api/spaces")
    async def spaces(request: Request) -> list[dict]:
        return [{"id": "s1", "name": "Biology", "seen_auth": request.headers.get("authorization")}]

    @app.get("/api/spaces/{space_id}/search")
    async def search(space_id: str, request: Request, q: str = "", limit: int = 10) -> dict:
        return {
            "results": [
                {"chunk_id": "k1", "space": space_id, "content": f"hit for {q}", "limit": limit, "seen_auth": request.headers.get("authorization")}
            ],
        }

    @app.get("/api/study/due")
    async def due(request: Request, limit: int = 50) -> dict:
        return {"cards": [{"id": "c1", "front": "ATP yield", "limit": limit, "seen_auth": request.headers.get("authorization")}]}

    @app.get("/api/analytics/summary")
    async def summary(request: Request) -> dict:
        return {
            "streak_days": 3,
            "due_today": 2,
            "cards_total": 9,
            "minutes_this_week": 40,
            "reviews_today": 5,
            "seen_auth": request.headers.get("authorization"),
        }

    @app.post("/api/notes", status_code=201)
    async def create_note(request: Request, body: dict) -> dict:
        return {"id": "n1", "received": body, "seen_auth": request.headers.get("authorization")}

    return app


def _free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _tool_text(session: ClientSession, name: str, args: dict) -> tuple[bool, str]:
    result = await session.call_tool(name, args)
    text = result.content[0].text if result.content else ""
    return bool(result.isError), text


@pytest.fixture(scope="module")
def mcp_base():
    """The real MCP mount (stub backend, fake token table) on a live port."""
    import studyspace.mcp_app as mcp_app
    from studyspace.mcp_app import create_mcp_mount

    original_verify = mcp_app.verify_pat
    mcp_app.verify_pat = _fake_verify_pat
    app = FastAPI()
    app.mount("/mcp", create_mcp_mount(_stub_backend()))

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(150):
        time.sleep(0.1)
        if server.started:
            break
    assert server.started, "uvicorn never came up for the MCP test server"
    try:
        yield f"http://127.0.0.1:{port}/mcp"
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        mcp_app.verify_pat = original_verify


@contextlib.asynccontextmanager
async def _session(base: str, token: str):
    async with sse_client(f"{base}/sse", headers=_auth(token)) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


def test_connect_without_token_is_401(mcp_base):
    resp = httpx.get(f"{mcp_base}/sse", timeout=5)
    assert resp.status_code == 401
    assert "ssk_" in resp.json()["detail"]


def test_garbage_token_is_401_on_sse_and_message_endpoint(mcp_base):
    resp = httpx.get(f"{mcp_base}/sse", headers=_auth("ssk_not-a-token"), timeout=5)
    assert resp.status_code == 401
    # The message POST is guarded too: a revoked token's next message dies
    # even while its stream is still open.
    resp = httpx.post(f"{mcp_base}/messages/?session_id=none", headers=_auth("ssk_not-a-token"), timeout=5)
    assert resp.status_code == 401


async def test_tools_list_and_read_flow_forwards_the_token(mcp_base):
    async with _session(mcp_base, "ssk_read") as session:
        tools = await session.list_tools()
        assert {tool.name for tool in tools.tools} == {
            "list_spaces",
            "search_sources",
            "get_due_cards",
            "get_study_stats",
            "create_note",
        }

        is_error, text = await _tool_text(session, "list_spaces", {})
        assert not is_error, text
        payload = json.loads(text)
        assert payload["spaces"][0]["name"] == "Biology"
        # The tool re-presents the caller's own token — the API re-verifies
        # it, RLS applies; the MCP layer grants nothing on its own.
        assert payload["spaces"][0]["seen_auth"] == "Bearer ssk_read"


async def test_write_only_token_cannot_read(mcp_base):
    async with _session(mcp_base, "ssk_write") as session:
        is_error, text = await _tool_text(session, "list_spaces", {})
        assert is_error, text
        assert "read" in text


async def test_read_only_token_cannot_create_notes(mcp_base):
    async with _session(mcp_base, "ssk_read") as session:
        is_error, text = await _tool_text(session, "create_note", {"title": "T", "content": "hi"})
        assert is_error, text
        assert "write" in text


async def test_create_note_delivers_plain_text_as_a_document(mcp_base):
    async with _session(mcp_base, "ssk_full") as session:
        is_error, text = await _tool_text(
            session, "create_note", {"title": "From MCP", "content": "Osmosis moves water."}
        )
        assert not is_error, text
        note = json.loads(text)["note"]
        assert note["id"] == "n1"
        body = note["received"]
        # Plain text in, TipTap document + plain text out — what /api/notes
        # requires, built from what the tool actually promises its callers.
        assert body["content_text"] == "Osmosis moves water."
        paragraph = body["content"]["content"][0]
        assert paragraph["content"][0]["text"] == "Osmosis moves water."
        assert note["seen_auth"] == "Bearer ssk_full"


async def test_search_sources_reaches_the_search_endpoint(mcp_base):
    async with _session(mcp_base, "ssk_read") as session:
        is_error, text = await _tool_text(session, "search_sources", {"space_id": "s1", "query": "osmosis"})
        assert not is_error, text
        payload = json.loads(text)
        assert payload["results"][0]["content"] == "hit for osmosis"
        assert payload["results"][0]["limit"] == 10
        assert payload["results"][0]["seen_auth"] == "Bearer ssk_read"


async def test_due_cards_and_stats_flow_through(mcp_base):
    async with _session(mcp_base, "ssk_full") as session:
        is_error, text = await _tool_text(session, "get_due_cards", {"limit": 5})
        assert not is_error, text
        cards = json.loads(text)["cards"]
        assert cards[0]["limit"] == 5
        assert cards[0]["seen_auth"] == "Bearer ssk_full"

        is_error, text = await _tool_text(session, "get_study_stats", {})
        assert not is_error, text
        stats = json.loads(text)
        assert stats["streak_days"] == 3
        assert stats["reviews_today"] == 5


async def test_caller_context_does_not_bleed_between_sessions(mcp_base):
    async with _session(mcp_base, "ssk_full") as first:
        _, text = await _tool_text(first, "list_spaces", {})
        assert json.loads(text)["spaces"][0]["seen_auth"] == "Bearer ssk_full"
    async with _session(mcp_base, "ssk_read") as second:
        _, text = await _tool_text(second, "list_spaces", {})
        assert json.loads(text)["spaces"][0]["seen_auth"] == "Bearer ssk_read"

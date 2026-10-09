"""The StudySpace MCP server, served by the backend itself at ``/mcp``.

Five tools over the caller's own study data — spaces, hybrid source
search, due cards, study stats, note creation — guarded by personal
access tokens (``ssk_...``) and living in the same process as the API
they call.

Why in-process: the standalone ``mcp/`` service this replaces could not
be deployed by the pipeline that ships everything else, verified tokens
over HTTP against a route nothing else used, and had no credential to
call the API with at all. Here the mount's middleware verifies a token
per request through the same function deps uses, the tools reach the
API over an in-process ASGI transport carrying the caller's own token,
and Row Level Security on the API side scopes every row — a revoked
token's next tool call dies at the first hop.

The caller (identity, scopes, raw token) travels in a contextvar set by
*pure ASGI* middleware: that shares the SSE connection's task, so tool
bodies see it — verified against mcp 1.25 with a live client session,
not assumed.
"""

from __future__ import annotations

import contextvars
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import BaseModel
from starlette.types import ASGIApp, Receive, Scope, Send

from studyspace.mcp_auth import PatIdentity, verify_pat

# Only the backend's own origin — tools ask for full /api/... paths, so
# no base-URL joining subtleties can quietly drop the prefix.
_INTERNAL_ORIGIN = "http://studyspace.internal"


@dataclass(frozen=True)
class _Caller:
    """One verified MCP caller: who they are, what they may do, and the
    token every backend hop re-presents so the API can re-check it."""

    user_id: str
    scopes: frozenset[str]
    token: str


_caller: contextvars.ContextVar[_Caller | None] = contextvars.ContextVar("mcp_caller", default=None)


def _bearer_from_scope(scope: Scope) -> str | None:
    for name, value in scope.get("headers", ()):
        if name == b"authorization":
            scheme, _, token = value.decode("latin-1").partition(" ")
            if scheme.lower() == "bearer" and token.strip():
                return token.strip()
    return None


class _RequireMcpToken:
    """Verify a live PAT on every request that enters the ``/mcp`` mount.

    Pure ASGI rather than BaseHTTPMiddleware so the caller contextvar is
    set in the same task the SSE connection — and the tool dispatch it
    drives — runs in. It also runs on each ``/messages`` POST, so a
    revoked token is refused at its next message even while its stream
    is still open.
    """

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        token = _bearer_from_scope(scope)
        ident: PatIdentity | None = await verify_pat(token) if token else None
        if ident is None:
            response = JSONResponse(
                {"detail": "A live StudySpace access token is required (Authorization: Bearer ssk_...)."},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return
        ctx = _caller.set(_Caller(user_id=ident.user_id, scopes=ident.scopes, token=token or ""))
        try:
            await self._app(scope, receive, send)
        finally:
            _caller.reset(ctx)


def _require_scope(scope: str) -> _Caller:
    """The caller for this tool call — or a refusal the client can read.

    The API enforces the same scopes server-side (deps gates the HTTP
    method); this copy exists only to answer a tool call with a helpful
    message instead of a bare 403 from somewhere downstream.
    """
    caller = _caller.get()
    if caller is None:
        raise ToolError("No authenticated caller in context — tools are reachable only over /mcp.")
    if scope not in caller.scopes:
        raise ToolError(f"This token does not carry the '{scope}' scope this tool needs.")
    return caller


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.is_error:
        raise ToolError(f"Backend answered {resp.status_code}: {resp.text[:300]}")


# ---------------------------------------------------------------------------
# Tool result shapes (stable contracts for MCP clients)
# ---------------------------------------------------------------------------


class ListSpacesResult(BaseModel):
    spaces: list[dict]


class SearchSourcesResult(BaseModel):
    results: list[dict]


class DueCardsResult(BaseModel):
    cards: list[dict]


class StudyStatsResult(BaseModel):
    streak_days: int
    due_today: int
    cards_total: int
    minutes_this_week: int
    reviews_today: int


class CreateNoteResult(BaseModel):
    note: dict


def create_mcp_mount(backend_app: FastAPI) -> ASGIApp:
    """Build the ``/mcp`` surface: SSE transport + token middleware,
    bound in-process to the app it serves for."""
    mcp = FastMCP("studyspace", stateless_http=True)

    @asynccontextmanager
    async def _backend_client(caller: _Caller) -> AsyncIterator[httpx.AsyncClient]:
        # The caller's own token is the bearer: deps re-verifies it, RLS
        # re-scopes it — the MCP layer grants no privileges of its own.
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=backend_app),
            base_url=_INTERNAL_ORIGIN,
            headers={"Authorization": f"Bearer {caller.token}"},
            timeout=30.0,
        ) as client:
            yield client

    @mcp.tool()
    async def list_spaces() -> ListSpacesResult:
        """List the study spaces belonging to the signed-in user (read scope)."""
        caller = _require_scope("read")
        async with _backend_client(caller) as client:
            resp = await client.get("/api/spaces")
            _raise_for_status(resp)
        return ListSpacesResult(spaces=resp.json())

    @mcp.tool()
    async def search_sources(space_id: str, query: str, limit: int = 10) -> SearchSourcesResult:
        """Search a space's sources by hybrid retrieval: vector + full-text (read scope)."""
        caller = _require_scope("read")
        async with _backend_client(caller) as client:
            resp = await client.post(
                f"/api/spaces/{space_id}/chat",
                json={
                    "message": query,
                    "source_ids": [],
                    "layers": {"relevance_gate": False, "citation_validation": False, "claim_verification": False},
                },
            )
            _raise_for_status(resp)
        data = resp.json()
        chunks: list[dict] = []
        for event in data.get("events", []):
            if event.get("type") == "retrieval":
                chunks.extend(event.get("chunks", []))
        return SearchSourcesResult(results=chunks[:limit])

    @mcp.tool()
    async def get_due_cards(limit: int = 50) -> DueCardsResult:
        """Get flashcards due for review (read scope)."""
        caller = _require_scope("read")
        async with _backend_client(caller) as client:
            resp = await client.get("/api/study/due", params={"limit": limit})
            _raise_for_status(resp)
        return DueCardsResult(cards=resp.json().get("cards", []))

    @mcp.tool()
    async def get_study_stats() -> StudyStatsResult:
        """Get study statistics: streak, due count, weekly minutes (read scope)."""
        caller = _require_scope("read")
        async with _backend_client(caller) as client:
            resp = await client.get("/api/analytics/summary", params={"days": 30})
            _raise_for_status(resp)
        data = resp.json()
        return StudyStatsResult(
            streak_days=data.get("streak_days", 0),
            due_today=data.get("due_today", 0),
            cards_total=data.get("cards_total", 0),
            minutes_this_week=data.get("minutes_this_week", 0),
            reviews_today=data.get("reviews_today", 0),
        )

    @mcp.tool()
    async def create_note(title: str, content: str, space_id: str | None = None) -> CreateNoteResult:
        """Create a note from plain text (write scope). `content` is the note's text, not markup."""
        caller = _require_scope("write")
        body: dict = {
            "title": title,
            "content_text": content,
            # The editor wants TipTap; one paragraph carrying the text is
            # the honest document for what the client actually sent.
            "content": {
                "type": "doc",
                "content": (
                    [{"type": "paragraph", "content": [{"type": "text", "text": content}]}] if content else []
                ),
            },
        }
        if space_id is not None:
            body["space_id"] = space_id
        async with _backend_client(caller) as client:
            resp = await client.post("/api/notes", json=body)
            _raise_for_status(resp)
        return CreateNoteResult(note=resp.json())

    return _RequireMcpToken(mcp.sse_app())

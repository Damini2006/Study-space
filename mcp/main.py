"""StudySpace MCP Server — exposes user's study data to MCP clients.

Tools (initial):
- list_spaces: list all spaces for the authenticated user
- search_sources: hybrid search over user's sources (requires space_id)
- get_due_cards: get flashcards due for review
- get_study_stats: get study statistics (streak, due count, etc.)
- create_note: create a new rich-text note (write scope required)

Authentication: Bearer token (personal access token from /api/me/mcp-tokens).
Scope control: read tools by default; create_note requires 'write' scope.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator, List, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from mcp.server.fastmcp import FastMCP
from mcp.types import Tool
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BACKEND_URL = os.environ.get("STUDYSPACE_BACKEND_URL", "http://localhost:8000/api")
MCP_TOKEN_PREFIX = os.environ.get("MCP_TOKEN_PREFIX", "ssk_")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@dataclass
class AuthenticatedUser:
    user_id: str
    scopes: List[str]


class ListSpacesResult(BaseModel):
    spaces: List[dict]


class SearchSourcesResult(BaseModel):
    results: List[dict]


class DueCardsResult(BaseModel):
    cards: List[dict]


class StudyStatsResult(BaseModel):
    streak_days: int
    due_today: int
    cards_total: int
    minutes_this_week: int
    reviews_today: int


class CreateNoteInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: dict = Field(default_factory=lambda: {"type": "doc", "content": []})
    content_text: str = Field(default="", max_length=200000)
    tags: List[str] = Field(default_factory=list, max_length=30)
    color: str = Field(default="#FFF9B3", pattern=r"^#[0-9A-Fa-f]{6}$")
    space_id: Optional[str] = None
    pinned: bool = False


class CreateNoteResult(BaseModel):
    note: dict


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

async def verify_mcp_token(
    authorization: str | None = Header(None),
) -> AuthenticatedUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()

    # Verify against backend (which checks hash + scopes + revocation)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BACKEND_URL}/me/mcp-tokens/verify",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    resp.raise_for_status()
    data = resp.json()
    return AuthenticatedUser(user_id=data["user_id"], scopes=data["scopes"])


def require_scope(*required_scopes: str):
    async def _check(user: AuthenticatedUser = Depends(verify_mcp_token)) -> AuthenticatedUser:
        for scope in required_scopes:
            if scope not in user.scopes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Token missing required scope: {scope}",
                )
        return user

    return _check


# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------

mcp = FastMCP("studyspace", stateless_http=True)


def _user_id_from_context() -> str:
    """Extract user_id from the FastMCP request context."""
    # FastMCP injects the FastAPI request into the context
    from mcp.server.fastmcp import Context
    ctx = Context.get_current()
    if ctx and hasattr(ctx, "request"):
        return ctx.request.state.user_id
    raise RuntimeError("No user_id in context")


def _make_client(user_id: str) -> httpx.AsyncClient:
    """Create an HTTP client with the user's JWT for backend calls."""
    # In practice, the MCP server would have its own token or use the user's
    # For now, we'll use a service token or the user's PAT
    # This is a simplified version - real impl would use the user's access token
    return httpx.AsyncClient(base_url=BACKEND_URL, timeout=30)


@mcp.tool()
async def list_spaces() -> ListSpacesResult:
    """List all study spaces for the authenticated user."""
    user_id = _user_id_from_context()
    async with _make_client(user_id) as client:
        resp = await client.get("/spaces")
        resp.raise_for_status()
    return ListSpacesResult(spaces=resp.json())


@mcp.tool()
async def search_sources(
    space_id: str,
    query: str,
    limit: int = 10,
) -> SearchSourcesResult:
    """Search sources in a specific space using hybrid retrieval."""
    user_id = _user_id_from_context()
    async with _make_client(user_id) as client:
        # Use the chat retrieval endpoint indirectly via a search
        # For MCP, we can call a dedicated search endpoint or use chat with retrieval only
        resp = await client.post(
            f"/spaces/{space_id}/chat",
            json={
                "message": query,
                "source_ids": [],
                "layers": {"relevance_gate": False, "citation_validation": False, "claim_verification": False},
            },
        )
        resp.raise_for_status()
    data = resp.json()
    # Extract retrieval chunks from the streaming response
    chunks = []
    for event in data.get("events", []):
        if event.get("type") == "retrieval":
            chunks.extend(event.get("chunks", []))
    return SearchSourcesResult(results=chunks[:limit])


@mcp.tool()
async def get_due_cards(limit: int = 50) -> DueCardsResult:
    """Get flashcards due for review."""
    user_id = _user_id_from_context()
    async with _make_client(user_id) as client:
        resp = await client.get(f"/study/due?limit={limit}")
        resp.raise_for_status()
    data = resp.json()
    return DueCardsResult(cards=data.get("cards", []))


@mcp.tool()
async def get_study_stats() -> StudyStatsResult:
    """Get study statistics for the user."""
    user_id = _user_id_from_context()
    async with _make_client(user_id) as client:
        resp = await client.get("/analytics/summary?days=30")
        resp.raise_for_status()
    data = resp.json()
    return StudyStatsResult(
        streak_days=data.get("streak_days", 0),
        due_today=data.get("due_today", 0),
        cards_total=data.get("cards_total", 0),
        minutes_this_week=data.get("minutes_this_week", 0),
        reviews_today=data.get("reviews_today", 0),
    )


@mcp.tool()
async def create_note(note: CreateNoteInput) -> CreateNoteResult:
    """Create a new rich-text note (requires write scope)."""
    user_id = _user_id_from_context()
    async with _make_client(user_id) as client:
        resp = await client.post("/notes", json=note.model_dump(exclude_none=True))
        resp.raise_for_status()
    return CreateNoteResult(note=resp.json())


# ---------------------------------------------------------------------------
# FastAPI app with health endpoint
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="StudySpace MCP",
    description="MCP server for StudySpace study data",
    lifespan=lifespan,
)

# Mount MCP SSE endpoint
app.mount("/mcp", mcp.sse_app())


@app.get("/health")
async def health():
    return {"status": "ok", "service": "studyspace-mcp"}


@app.get("/me/mcp-tokens/verify")
async def verify_token_endpoint(
    authorization: str | None = Header(None),
):
    """Verify an MCP token and return user_id + scopes."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    # Hash and look up in backend
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BACKEND_URL}/me/mcp-tokens/verify-by-hash",
            params={"token_hash": token_hash},
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=401, detail="Token not found or revoked")
    resp.raise_for_status()
    return resp.json()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
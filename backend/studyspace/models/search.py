"""Search: the JSON retrieval surface (what the MCP search tool calls)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class SearchHit(BaseModel):
    """One retrieved chunk: what it is, where it came from, how it ranked."""

    chunk_id: uuid.UUID
    source_id: uuid.UUID
    source_title: str
    content: str
    page: int | None = None
    fused_score: float
    final_score: float
    rank: int


class SearchResponse(BaseModel):
    results: list[SearchHit]

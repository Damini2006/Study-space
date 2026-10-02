"""Chat (source-grounded RAG conversation)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AnswerStatus = Literal["pending", "verified", "low_confidence", "not_found"]


class LayerToggles(BaseModel):
    """Per-request overrides for the four hallucination-protection layers."""

    relevance_gate: bool | None = None
    citation_validation: bool | None = None
    claim_verification: bool | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    thread_id: uuid.UUID | None = None
    # Restrict retrieval to specific sources; empty = whole space.
    source_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    layers: LayerToggles | None = None
    # Socratic tutor mode: the assistant guides instead of answering directly.
    socratic: bool = False


class ChatCitation(BaseModel):
    label: int
    chunk_id: uuid.UUID
    source_id: uuid.UUID | None = None
    source_title: str | None = None
    page: int | None = None
    quote: str
    score: float | None = None
    verified: bool = False

    model_config = {"from_attributes": True}


class RetrievedChunk(BaseModel):
    """Sent to the client as the `sources` SSE event so the Sources panel can
    show what was searched *before* the answer streams."""

    chunk_id: uuid.UUID
    source_id: uuid.UUID
    source_title: str
    page: int | None = None
    snippet: str
    score: float
    vector_score: float | None = None
    fts_score: float | None = None
    label: int


class ClaimOut(BaseModel):
    text: str
    supported: bool
    judge_score: float | None = None
    chunk_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class ChatMessage(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    role: Literal["user", "assistant", "system"]
    content: str
    status: AnswerStatus | None = None
    citations: list[ChatCitation] = Field(default_factory=list)
    claims: list[ClaimOut] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatThread(BaseModel):
    id: uuid.UUID
    space_id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatHistory(BaseModel):
    thread: ChatThread
    messages: list[ChatMessage]

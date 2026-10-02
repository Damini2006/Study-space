"""Notes (TipTap rich text)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(default="Untitled", min_length=1, max_length=200)
    content: dict = Field(default_factory=lambda: {"type": "doc", "content": []})
    content_text: str = Field(default="", max_length=200_000)
    tags: list[str] = Field(default_factory=list, max_length=30)
    color: str = Field(default="#FFF9B3", pattern=r"^#[0-9A-Fa-f]{6}$")
    space_id: uuid.UUID | None = None
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: dict | None = None
    content_text: str | None = Field(default=None, max_length=200_000)
    tags: list[str] | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    space_id: uuid.UUID | None = None
    pinned: bool | None = None


class NoteOut(BaseModel):
    id: uuid.UUID
    title: str
    content: dict
    content_text: str
    tags: list[str] = Field(default_factory=list)
    pinned: bool = False
    color: str
    space_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

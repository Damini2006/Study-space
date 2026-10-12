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
    folder_id: uuid.UUID | None = None
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: dict | None = None
    content_text: str | None = Field(default=None, max_length=200_000)
    tags: list[str] | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    space_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
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
    folder_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NoteVersionOut(BaseModel):
    """A snapshot of a note as it was before an edit."""

    id: uuid.UUID
    note_id: uuid.UUID
    title: str
    content: dict
    content_text: str
    tags: list[str] = Field(default_factory=list)
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteFolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class NoteFolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)


class NoteFolderOut(BaseModel):
    id: uuid.UUID
    name: str
    note_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteBulkAction(BaseModel):
    """One operation applied to many notes at once.

    `ids` is capped at 100 so a stray double-click can't try to
    rewrite the whole library in a single statement.
    """

    action: str = Field(pattern="^(delete|move|pin)$")
    ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    folder_id: uuid.UUID | None = None  # move target
    pinned: bool | None = None  # pin / unpin


class NoteRestoreVersion(BaseModel):
    version_id: uuid.UUID

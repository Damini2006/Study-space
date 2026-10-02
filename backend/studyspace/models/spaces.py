"""Spaces (study workspaces)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SpaceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    subject: str | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class SpaceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    subject: str | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    archived: bool | None = None


class SpaceOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    subject: str | None = None
    color: str | None = None
    archived: bool = False
    created_at: datetime
    updated_at: datetime
    source_count: int = 0
    ready_source_count: int = 0
    card_count: int = 0
    due_today: int = 0

    model_config = {"from_attributes": True}

"""Spaces (study workspaces) + sharing & publishing."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

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


# ---- Sharing ----

class ShareRole(str, Enum):
    viewer = "viewer"
    editor = "editor"


class SpaceShareCreate(BaseModel):
    role: ShareRole = ShareRole.viewer
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class SpaceShareOut(BaseModel):
    id: uuid.UUID
    space_id: uuid.UUID
    role: ShareRole
    token: str                    # only returned on create
    expires_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


class SpaceShareListItem(BaseModel):
    id: uuid.UUID
    space_id: uuid.UUID
    role: ShareRole
    expires_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


# ---- Public publishing ----

class SpacePublicCreate(BaseModel):
    slug: str = Field(min_length=3, max_length=60, pattern=r"^[a-z0-9-]+$")


class SpacePublicOut(BaseModel):
    space_id: uuid.UUID
    slug: str
    published_at: datetime
    unpublished_at: datetime | None
    public_url: str

    model_config = {"from_attributes": True}

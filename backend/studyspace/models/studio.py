"""Studio outputs: summary / study guide / flashcards / quiz."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

StudioType = Literal["summary", "guide", "flashcards", "quiz"]


class StudioGenerateRequest(BaseModel):
    type: StudioType
    # Empty = all ready sources in the space.
    source_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    topic: str | None = Field(default=None, max_length=200)
    count: int | None = Field(default=None, ge=1, le=40)  # flashcards / quiz size


class StudioOutputOut(BaseModel):
    id: uuid.UUID
    space_id: uuid.UUID
    type: StudioType
    title: str
    content: dict | list
    source_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StudioUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: dict | list | None = None

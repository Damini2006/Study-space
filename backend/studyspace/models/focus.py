"""Focus sessions (Pomodoro)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FocusSessionCreate(BaseModel):
    kind: Literal["focus", "break"] = "focus"
    duration_min: int = Field(default=25, ge=1, le=180)
    started_at: datetime | None = None
    space_id: uuid.UUID | None = None
    completed: bool = True


class FocusSessionOut(BaseModel):
    id: uuid.UUID
    kind: Literal["focus", "break"]
    duration_min: int
    started_at: datetime
    ended_at: datetime | None = None
    completed: bool
    space_id: uuid.UUID | None = None
    space_title: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

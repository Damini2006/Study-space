"""Habits (ported from the prototype, now backed by Postgres)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(default="#4F5BD5", pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: str = Field(default="check", max_length=24)
    target_days: int = Field(default=7, ge=1, le=7)


class HabitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: str | None = Field(default=None, max_length=24)
    target_days: int | None = Field(default=None, ge=1, le=7)
    archived: bool | None = None


class HabitLogOut(BaseModel):
    id: uuid.UUID
    habit_id: uuid.UUID
    log_date: date
    value: int = 1
    created_at: datetime

    model_config = {"from_attributes": True}


class HabitOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    icon: str
    target_days: int
    archived: bool
    created_at: datetime
    updated_at: datetime
    logs: list[HabitLogOut] = Field(default_factory=list)
    done_today: bool = False
    streak: int = 0

    model_config = {"from_attributes": True}


class HabitLogCreate(BaseModel):
    log_date: date | None = None
    value: int = Field(default=1, ge=0, le=100)

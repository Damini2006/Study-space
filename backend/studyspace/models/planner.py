"""LangGraph planner models (human-in-the-loop)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class ExamDate(BaseModel):
    subject: str = Field(min_length=1, max_length=80)
    exam_date: date


class AvailabilitySlot(BaseModel):
    # 0 = Monday ... 6 = Sunday
    weekday: int = Field(ge=0, le=6)
    minutes: int = Field(ge=15, le=720)


class PlannerRunCreate(BaseModel):
    exam_dates: list[ExamDate] = Field(default_factory=list, max_length=20)
    availability: list[AvailabilitySlot] = Field(default_factory=list, max_length=7)
    weak_topics: list[str] = Field(default_factory=list, max_length=30)
    space_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    title: str | None = Field(default=None, max_length=200)


class GhostTask(BaseModel):
    """A proposed task shown as a dashed ghost card until approved."""

    title: str = Field(min_length=1, max_length=300)
    topic: str | None = Field(default=None, max_length=120)
    due: date | None = None
    duration_min: int = Field(default=45, ge=5, le=600)
    space_id: uuid.UUID | None = None
    day: str | None = None  # informational, e.g. "Tue"


class PlannerProposal(BaseModel):
    rationale: str = ""
    tasks: list[GhostTask] = Field(default_factory=list)


class PlannerRunOut(BaseModel):
    id: uuid.UUID
    status: Literal["running", "awaiting_approval", "approved", "rejected", "failed"]
    input: dict = Field(default_factory=dict)
    proposal: PlannerProposal | None = None
    plan_id: uuid.UUID | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlannerApprove(BaseModel):
    # Optional edits to the proposal applied at approval time (still explicit
    # human approval — nothing was written before this call).
    tasks: list[GhostTask] | None = Field(default=None, max_length=40)
    plan_title: str | None = Field(default=None, max_length=200)


class PlanTaskOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    title: str
    topic: str | None = None
    due: date | None = None
    duration_min: int
    space_id: uuid.UUID | None = None
    status: Literal["pending", "done", "skipped"]
    source: Literal["manual", "ai"]
    order_idx: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

"""FSRS study session models."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Rating = Literal[1, 2, 3, 4]  # Again / Hard / Good / Easy
CardState = Literal["learning", "review", "relearning"]


class CardOut(BaseModel):
    id: uuid.UUID
    space_id: uuid.UUID
    space_title: str | None = None
    front: str
    back: str
    tags: list[str] = Field(default_factory=list)
    source_chunk_id: uuid.UUID | None = None
    created_at: datetime
    # scheduling state
    due: datetime | None = None
    state: CardState = "learning"
    reps: int = 0
    lapses: int = 0
    stability: float = 0.0
    difficulty: float = 0.0

    model_config = {"from_attributes": True}


class DueOut(BaseModel):
    due_count: int = 0
    new_count: int = 0
    learning_count: int = 0
    review_count: int = 0
    total_cards: int = 0
    cards: list[CardOut] = Field(default_factory=list)


class ReviewIn(BaseModel):
    card_id: uuid.UUID
    rating: Rating
    duration_ms: int | None = Field(default=None, ge=0, le=600_000)


class ReviewOut(BaseModel):
    card_id: uuid.UUID
    rating: Rating
    due: datetime
    state: CardState
    stability: float
    difficulty: float
    reps: int
    lapses: int
    interval_days: float
    due_count: int = 0

    model_config = {"from_attributes": True}

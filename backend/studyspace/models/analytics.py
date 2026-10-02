"""Analytics summary models."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class HeatmapDay(BaseModel):
    day: date
    minutes: int = 0
    reviews: int = 0
    habits: int = 0


class SubjectTime(BaseModel):
    subject: str
    minutes: int


class WeakTopic(BaseModel):
    topic: str
    samples: int
    lapse_rate: float


class AnalyticsSummary(BaseModel):
    heatmap: list[HeatmapDay] = Field(default_factory=list)
    streak_days: int = 0
    minutes_this_week: int = 0
    minutes_last_week: int = 0
    focus_sessions_this_week: int = 0
    due_today: int = 0
    reviews_today: int = 0
    cards_total: int = 0
    per_subject: list[SubjectTime] = Field(default_factory=list)
    weak_topics: list[WeakTopic] = Field(default_factory=list)
    daily_quote: str | None = None

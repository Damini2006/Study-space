"""Evaluation run models (Admin/Evals page)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class EvalConfig(BaseModel):
    """One configuration of the hallucination-protection layers."""

    name: str = Field(min_length=1, max_length=80, description="e.g. 'baseline', '+relevance-gate'")
    relevance_gate: bool = False
    citation_validation: bool = False
    claim_verification: bool = False


class EvalRunCreate(BaseModel):
    label: str = Field(default="manual", max_length=120)
    configs: list[EvalConfig] = Field(default_factory=list, max_length=8)
    limit: int | None = Field(default=None, ge=1, le=200, description="Cap number of questions")
    dataset_version: str = Field(default="v1", max_length=40)


class EvalRunOut(BaseModel):
    id: uuid.UUID
    label: str
    dataset_version: str
    config: dict[str, Any] = Field(default_factory=dict)
    status: Literal["pending", "running", "completed", "failed"]
    summary: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class EvalResultOut(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    question_id: str
    question: str
    kind: Literal["answerable", "unanswerable"]
    answer: str | None = None
    reference: str | None = None
    status: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class EvalSummaryTable(BaseModel):
    """Aggregated per-config metrics — rendered as the README/Admin table."""

    rows: list[dict[str, Any]] = Field(default_factory=list)

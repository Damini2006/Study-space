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


# The suite's default ablation ladder: each config adds one layer on top
# of the previous one, so a score that moves attributes to the layer that
# just switched on. Shared by the run router (what a run plans) and the
# runner (what a plan falls back to when config is empty).
DEFAULT_CONFIGS: list[dict[str, Any]] = [
    {"name": "baseline", "relevance_gate": False, "citation_validation": False, "claim_verification": False},
    {"name": "+relevance-gate", "relevance_gate": True, "citation_validation": False, "claim_verification": False},
    {"name": "+citation-validation", "relevance_gate": True, "citation_validation": True, "claim_verification": False},
    {"name": "+claim-verification", "relevance_gate": True, "citation_validation": True, "claim_verification": True},
]


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
    config: str = Field(min_length=1, description="Which layer config produced this row")
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

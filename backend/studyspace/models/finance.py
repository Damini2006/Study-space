"""Finance transactions (ported from the prototype, bug fixed)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class TransactionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    amount: float = Field(ge=0, le=100_000_000)
    kind: str = Field(default="expense", pattern=r"^(expense|income)$")
    category: str = Field(default="Other", min_length=1, max_length=40)
    spent_on: date | None = None
    note: str = Field(default="", max_length=500)


class TransactionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    amount: float | None = Field(default=None, ge=0, le=100_000_000)
    kind: str | None = Field(default=None, pattern=r"^(expense|income)$")
    category: str | None = Field(default=None, min_length=1, max_length=40)
    spent_on: date | None = None
    note: str | None = Field(default=None, max_length=500)


class TransactionOut(BaseModel):
    id: uuid.UUID
    title: str
    amount: float
    kind: str
    category: str
    spent_on: date
    note: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CategorySlice(BaseModel):
    category: str
    total: float
    share: float  # 0..1 of the expense total


class FinanceSummary(BaseModel):
    balance: float
    income: float
    expense: float
    by_category: list[CategorySlice]
    currency: str = "INR"

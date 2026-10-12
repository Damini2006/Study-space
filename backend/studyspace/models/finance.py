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


class BudgetCreate(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    month: date  # first day of the budget month
    limit_amount: float = Field(gt=0, le=100_000_000)


class BudgetUpdate(BaseModel):
    limit_amount: float | None = Field(default=None, gt=0, le=100_000_000)


class BudgetOut(BaseModel):
    category: str
    month: date
    limit_amount: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetStatus(BaseModel):
    """A limit alongside what has actually been spent against it."""

    category: str
    limit_amount: float
    spent: float
    # 'ok' (under 80%), 'near' (80–100%), 'over' (over 100%)
    status: str = "ok"


class FinanceSummary(BaseModel):
    balance: float
    income: float
    expense: float
    by_category: list[CategorySlice]
    budgets: list[BudgetStatus] = Field(default_factory=list)
    currency: str = "INR"

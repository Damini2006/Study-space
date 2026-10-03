"""Finance — transactions with a working category summary (prototype port).

Single-user scoped through RLS; the summary powers the animated donut on
the Finance page (₹ amounts, tabular figures).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from studyspace.deps import DbDep
from studyspace.models.finance import (
    CategorySlice,
    FinanceSummary,
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
)

router = APIRouter(prefix="/finance", tags=["finance"])

_SELECT = (
    "select id, title, amount, kind, category, spent_on, note, created_at, updated_at "
    "from public.transactions "
)


def _to_out(row) -> TransactionOut:
    return TransactionOut(
        id=row["id"], title=row["title"], amount=row["amount"], kind=row["kind"],
        category=row["category"], spent_on=row["spent_on"], note=row["note"],
        created_at=row["created_at"], updated_at=row["updated_at"],
    )


@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(
    db: DbDep,
    days: int = Query(default=90, ge=1, le=366),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[TransactionOut]:
    since = date.today() - timedelta(days=days)
    rows = await db.fetch(
        _SELECT + "where user_id = auth.uid() and spent_on >= $1 order by spent_on desc, created_at desc limit $2",
        since, limit,
    )
    return [_to_out(r) for r in rows]


@router.post("/transactions", response_model=TransactionOut, status_code=201)
async def create_transaction(body: TransactionCreate, db: DbDep) -> TransactionOut:
    spent_on = body.spent_on or date.today()
    row = await db.fetchrow(
        "insert into public.transactions (title, amount, kind, category, spent_on, note) "
        "values ($1, $2, $3, $4, $5, $6) returning id, title, amount, kind, category, "
        "spent_on, note, created_at, updated_at",
        body.title, body.amount, body.kind, body.category, spent_on, body.note,
    )
    return _to_out(row)


@router.patch("/transactions/{tx_id}", response_model=TransactionOut)
async def update_transaction(tx_id: uuid.UUID, body: TransactionUpdate, db: DbDep) -> TransactionOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"update public.transactions set {sets} where id = $1 and user_id = auth.uid() "
        "returning id, title, amount, kind, category, spent_on, note, created_at, updated_at",
        tx_id, *fields.values(),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return _to_out(row)


@router.delete("/transactions/{tx_id}", status_code=204)
async def delete_transaction(tx_id: uuid.UUID, db: DbDep) -> None:
    result = await db.execute(
        "delete from public.transactions where id = $1 and user_id = auth.uid()", tx_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Transaction not found.")


@router.get("/summary", response_model=FinanceSummary)
async def summary(db: DbDep, days: int = Query(default=30, ge=1, le=366)) -> FinanceSummary:
    since = date.today() - timedelta(days=days)
    rows = await db.fetch(
        "select amount, kind, category from public.transactions "
        "where user_id = auth.uid() and spent_on >= $1",
        since,
    )
    income = sum(r["amount"] for r in rows if r["kind"] == "income")
    expense = sum(r["amount"] for r in rows if r["kind"] == "expense")

    per_category: dict[str, float] = {}
    for r in rows:
        if r["kind"] == "expense":
            per_category[r["category"]] = per_category.get(r["category"], 0.0) + r["amount"]
    total_expense = expense or 0.0
    by_category = [
        CategorySlice(
            category=cat,
            total=round(total, 2),
            share=round(total / total_expense, 4) if total_expense else 0.0,
        )
        for cat, total in sorted(per_category.items(), key=lambda kv: -kv[1])
    ]
    return FinanceSummary(
        balance=round(income - expense, 2),
        income=round(income, 2),
        expense=round(expense, 2),
        by_category=by_category,
    )

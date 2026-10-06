"""Habits (ported from the prototype, backed by Postgres + RLS)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from studyspace.deps import DbDep
from studyspace.models.habits import HabitCreate, HabitLogCreate, HabitLogOut, HabitOut, HabitUpdate

router = APIRouter(prefix="/habits", tags=["habits"])


def _streak(log_dates: set[date], today: date) -> int:
    streak = 0
    cursor = today
    if today not in log_dates:
        cursor = today - timedelta(days=1)  # today not logged yet doesn't break it
    while cursor in log_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("", response_model=list[HabitOut])
async def list_habits(db: DbDep, days: int = Query(default=30, ge=7, le=180)) -> list[HabitOut]:
    since = date.today() - timedelta(days=days)
    habits = await db.fetch(
        "select * from public.habits where user_id = auth.uid() and not archived "
        "order by created_at"
    )
    logs = await db.fetch(
        "select id, habit_id, log_date, value, created_at from public.habit_logs "
        "where user_id = auth.uid() and log_date >= $1 order by log_date desc",
        since,
    )
    today = date.today()
    out: list[HabitOut] = []
    for h in habits:
        h_logs = [entry for entry in logs if entry["habit_id"] == h["id"]]
        log_dates = {entry["log_date"] for entry in h_logs}
        out.append(
            HabitOut(
                id=h["id"], name=h["name"], color=h["color"], icon=h["icon"],
                target_days=h["target_days"], archived=h["archived"],
                created_at=h["created_at"], updated_at=h["updated_at"],
                logs=[HabitLogOut(**dict(entry)) for entry in h_logs[:60]],
                done_today=today in log_dates,
                streak=_streak(log_dates, today),
            )
        )
    return out


@router.post("", response_model=HabitOut, status_code=201)
async def create_habit(body: HabitCreate, db: DbDep) -> HabitOut:
    row = await db.fetchrow(
        "insert into public.habits (name, color, icon, target_days) values ($1, $2, $3, $4) returning *",
        body.name, body.color, body.icon, body.target_days,
    )
    return HabitOut(
        id=row["id"], name=row["name"], color=row["color"], icon=row["icon"],
        target_days=row["target_days"], archived=row["archived"],
        created_at=row["created_at"], updated_at=row["updated_at"],
        logs=[], done_today=False, streak=0,
    )


@router.patch("/{habit_id}", response_model=HabitOut)
async def update_habit(habit_id: uuid.UUID, body: HabitUpdate, db: DbDep) -> HabitOut:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
    row = await db.fetchrow(
        f"update public.habits set {sets} where id = $1 and user_id = auth.uid() returning *",
        habit_id, *fields.values(),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Habit not found.")
    return HabitOut(
        id=row["id"], name=row["name"], color=row["color"], icon=row["icon"],
        target_days=row["target_days"], archived=row["archived"],
        created_at=row["created_at"], updated_at=row["updated_at"],
        logs=[], done_today=False, streak=0,
    )


@router.delete("/{habit_id}", status_code=204)
async def delete_habit(habit_id: uuid.UUID, db: DbDep) -> None:
    result = await db.execute(
        "delete from public.habits where id = $1 and user_id = auth.uid()", habit_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Habit not found.")


@router.post("/{habit_id}/logs", response_model=HabitOut, status_code=201)
async def toggle_log(habit_id: uuid.UUID, body: HabitLogCreate, db: DbDep) -> HabitOut:
    log_date = body.log_date or date.today()
    exists = await db.fetchval(
        "select id from public.habit_logs where habit_id = $1 and log_date = $2 and user_id = auth.uid()",
        habit_id, log_date,
    )
    if exists:
        await db.execute(
            "delete from public.habit_logs where id = $1 and user_id = auth.uid()", exists
        )
    else:
        await db.execute(
            "insert into public.habit_logs (user_id, habit_id, log_date, value) values (auth.uid(), $1, $2, $3)",
            habit_id, log_date, body.value,
        )
    return await _habit_with_logs(habit_id, db)


@router.delete("/{habit_id}/logs/{log_date}", response_model=HabitOut)
async def delete_log(habit_id: uuid.UUID, log_date: date, db: DbDep) -> HabitOut:
    await db.execute(
        "delete from public.habit_logs where habit_id = $1 and log_date = $2 and user_id = auth.uid()",
        habit_id, log_date,
    )
    return await _habit_with_logs(habit_id, db)


async def _habit_with_logs(habit_id: uuid.UUID, db) -> HabitOut:
    h = await db.fetchrow(
        "select * from public.habits where id = $1 and user_id = auth.uid()", habit_id
    )
    if h is None:
        raise HTTPException(status_code=404, detail="Habit not found.")
    logs = await db.fetch(
        "select id, habit_id, log_date, value, created_at from public.habit_logs "
        "where habit_id = $1 order by log_date desc limit 60",
        habit_id,
    )
    log_dates = {entry["log_date"] for entry in logs}
    return HabitOut(
        id=h["id"], name=h["name"], color=h["color"], icon=h["icon"],
        target_days=h["target_days"], archived=h["archived"],
        created_at=h["created_at"], updated_at=h["updated_at"],
        logs=[HabitLogOut(**dict(entry)) for entry in logs],
        done_today=date.today() in log_dates,
        streak=_streak(log_dates, date.today()),
    )

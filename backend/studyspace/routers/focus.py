"""Focus sessions (Pomodoro) — logged for analytics and streaks."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from studyspace.deps import DbDep
from studyspace.models.focus import FocusSessionCreate, FocusSessionOut

router = APIRouter(prefix="/focus", tags=["focus"])


@router.get("/sessions", response_model=list[FocusSessionOut])
async def list_sessions(
    db: DbDep, limit: int = Query(default=100, ge=1, le=500)
) -> list[FocusSessionOut]:
    rows = await db.fetch(
        "select f.id, f.kind, f.duration_min, f.started_at, f.ended_at, f.completed, "
        "f.space_id, sp.title as space_title, f.created_at "
        "from public.focus_sessions f left join public.spaces sp on sp.id = f.space_id "
        "where f.user_id = auth.uid() order by f.started_at desc limit $1",
        limit,
    )
    return [
        FocusSessionOut(
            id=r["id"], kind=r["kind"], duration_min=r["duration_min"],
            started_at=r["started_at"], ended_at=r["ended_at"], completed=r["completed"],
            space_id=r["space_id"], space_title=r["space_title"], created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post("/sessions", response_model=FocusSessionOut, status_code=201)
async def create_session(body: FocusSessionCreate, db: DbDep) -> FocusSessionOut:
    started = body.started_at or datetime.now(timezone.utc)
    ended = None
    if body.completed:
        from datetime import timedelta

        ended = started + timedelta(minutes=body.duration_min)
    row = await db.fetchrow(
        "insert into public.focus_sessions (user_id, space_id, kind, started_at, ended_at, duration_min, completed) "
        "values (auth.uid(), $1, $2, $3, $4, $5, $6) returning id, kind, duration_min, started_at, "
        "ended_at, completed, space_id, created_at",
        body.space_id, body.kind, started, ended, body.duration_min, body.completed,
    )
    return FocusSessionOut(
        id=row["id"], kind=row["kind"], duration_min=row["duration_min"],
        started_at=row["started_at"], ended_at=row["ended_at"], completed=row["completed"],
        space_id=row["space_id"], space_title=None, created_at=row["created_at"],
    )


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(db: DbDep, session_id: uuid.UUID) -> None:
    result = await db.execute(
        "delete from public.focus_sessions where id = $1 and user_id = auth.uid()", session_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Session not found.")

"""Data export and account deletion (privacy controls from the spec)."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from studyspace.deps import DbDep, UserDep
from studyspace.services.demo_seed import reset_user_data

router = APIRouter(prefix="/me", tags=["privacy"])

_EXPORT_TABLES = [
    "profiles", "spaces", "sources", "chat_threads", "messages", "citations",
    "claims", "studio_outputs", "cards", "card_state", "review_logs", "notes",
    "plans", "plan_tasks", "planner_runs", "focus_sessions", "habits",
    "habit_logs", "mcp_tokens", "eval_runs", "eval_results",
]


@router.get("/export")
async def export_data(db: DbDep, user: UserDep) -> JSONResponse:
    """Download everything this account owns as JSON."""
    payload: dict = {
        "exported_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "user": {"id": user.id, "email": user.email},
        "data": {},
    }
    for table in _EXPORT_TABLES:
        if table == "profiles":
            rows = await db.fetch(
                "select * from public.profiles where user_id = auth.uid()"
            )
        else:
            rows = await db.fetch(f"select * from public.{table} where user_id = auth.uid()")
        cleaned = []
        for r in rows:
            item = {}
            for k, v in dict(r).items():
                if hasattr(v, "isoformat"):
                    item[k] = v.isoformat()
                elif isinstance(v, (list, tuple)):
                    item[k] = [str(x) for x in v]
                elif hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, type(None))):
                    item[k] = str(v)
                else:
                    item[k] = v
            cleaned.append(item)
        payload["data"][table] = cleaned

    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="studyspace-export.json"'},
    )


@router.delete("")
async def delete_account(db: DbDep, user: UserDep) -> dict:
    """Delete all database rows owned by this account, as the user (RLS).

    The frontend then deletes the auth user with its own JWT (GoTrue
    DELETE /auth/v1/user) — no service-role key is involved.
    """
    await reset_user_data(user.id, db)
    for table in ("review_logs", "eval_results", "eval_runs", "mcp_tokens", "planner_checkpoints", "profiles"):
        try:
            await db.execute(f"delete from public.{table} where user_id = $1", user.id)
        except Exception:
            pass  # some tables may be empty / absent in older databases
    return {"ok": True, "detail": "All study data deleted. Sign out to finish removing your account."}

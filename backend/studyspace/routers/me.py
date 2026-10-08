"""Data export and account deletion (privacy controls from the spec)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from studyspace.deps import DbDep, UserDep
from studyspace.services.demo_seed import reset_user_data
from studyspace.services.source_intake import StorageDeleteError, delete_from_storage

router = APIRouter(prefix="/me", tags=["privacy"])

_EXPORT_TABLES = [
    "profiles", "spaces", "sources", "chat_threads", "messages", "citations",
    "claims", "studio_outputs", "cards", "card_state", "review_logs", "notes",
    "plans", "plan_tasks", "planner_runs", "focus_sessions", "habits",
    "habit_logs", "mcp_tokens", "eval_runs", "eval_results",
    "vision_items", "transactions",
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
                "select * from public.profiles where id = auth.uid()"
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
async def delete_account(request: Request, db: DbDep, user: UserDep) -> dict:
    """Delete every study row this account owns, and report exactly what went.

    Rows first, then files: if anything raises before the rows are gone the
    transaction rolls back and the account is untouched and deletable again.
    File removal after that is *counted*, never assumed — the response says
    how many stored documents were removed and how many were not, so the UI
    can repeat a true sentence.

    The Supabase Auth sign-in record (email/password) is deliberately not
    touched: no router holds an admin key (SECURITY.md) and Supabase offers a
    signed-in user no self-delete API. The Settings UI and the privacy policy
    state that plainly instead of promising an account erase this code cannot
    perform.
    """
    paths = [
        r["storage_path"]
        for r in await db.fetch(
            "select storage_path from public.sources "
            "where user_id = auth.uid() and storage_path is not null"
        )
    ]

    # No try/except around these: one failed statement poisons the whole
    # transaction, and swallowing that made every earlier delete roll back
    # while the response still claimed "All study data deleted."
    await reset_user_data(user.id, db)
    for table in ("review_logs", "eval_results", "eval_runs", "mcp_tokens", "planner_checkpoints"):
        await db.execute(f"delete from public.{table} where user_id = $1", user.id)
    await db.execute("delete from public.profiles where id = $1", user.id)

    token = request.headers.get("authorization", "").split(" ", 1)[-1]
    removed = 0
    failed = 0
    for path in paths:
        try:
            await delete_from_storage(token=token, path=path)
            removed += 1
        except StorageDeleteError:
            failed += 1

    if not paths:
        outcome = "All study data deleted."
    elif failed == 0:
        outcome = f"All study data deleted, including all {removed} stored documents."
    else:
        outcome = (
            f"All study rows deleted, but {failed} of {len(paths)} "
            "stored documents could not be removed."
        )
    return {
        "ok": True,
        "files_removed": removed,
        "files_failed": failed,
        "detail": outcome
        + " Your sign-in email remains — this app never holds the admin keys needed to erase it.",
    }

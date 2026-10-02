"""Health + current-user profile routes."""

from __future__ import annotations

import json

from fastapi import APIRouter

from studyspace.deps import DbDep, UserDep
from studyspace.models.notes import NoteOut  # noqa: F401  (keeps model import graph warm)

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "studyspace-api"}


@router.get("/me")
async def me(user: UserDep, db: DbDep) -> dict:
    row = await db.fetchrow(
        "select user_id, display_name, theme, settings, created_at from public.profiles where user_id = $1",
        user.id,
    )
    if row is None:
        # profile trigger may not have fired (e.g. seeded users) — create it
        row = await db.fetchrow(
            "insert into public.profiles (user_id, display_name) values ($1, $2) "
            "on conflict (user_id) do update set display_name = excluded.display_name "
            "returning user_id, display_name, theme, settings, created_at",
            user.id, (user.email or "Student").split("@")[0][:40],
        )
    return {
        "id": str(row["user_id"]),
        "display_name": row["display_name"],
        "theme": row["theme"],
        "settings": json.loads(row["settings"]) if isinstance(row["settings"], str) else row["settings"],
        "email": user.email,
        "is_admin": user.is_admin,
        "created_at": row["created_at"].isoformat(),
    }


@router.patch("/me")
async def update_me(user: UserDep, db: DbDep, body: dict) -> dict:
    allowed = {}
    if "display_name" in body:
        name = str(body["display_name"]).strip()[:40]
        if name:
            allowed["display_name"] = name
    if "theme" in body and body["theme"] in ("light", "dark", "cozy", "pastel"):
        allowed["theme"] = body["theme"]
    if "settings" in body and isinstance(body["settings"], dict):
        allowed["settings"] = json.dumps(body["settings"])
    if allowed:
        sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(allowed))
        await db.execute(
            f"update public.profiles set {sets} where user_id = $1",
            user.id,
            *allowed.values(),
        )
    row = await db.fetchrow(
        "select user_id, display_name, theme, settings from public.profiles where user_id = $1",
        user.id,
    )
    return {
        "id": str(row["user_id"]),
        "display_name": row["display_name"],
        "theme": row["theme"],
        "settings": json.loads(row["settings"]) if isinstance(row["settings"], str) else row["settings"],
    }

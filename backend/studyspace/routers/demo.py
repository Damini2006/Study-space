"""Demo workspace: one-click seeded environment (no signup flow for the user).

The frontend creates/loads a throwaway demo account via Supabase Auth and then
calls this endpoint. All seeding runs as the authenticated user (RLS-scoped),
so the demo uses zero elevated privileges in the request path.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from studyspace.config import get_settings
from studyspace.deps import DbDep, UserDep
from studyspace.services.demo_seed import reset_user_data, seed_demo

router = APIRouter(prefix="/demo", tags=["demo"])


class DemoRequest(BaseModel):
    reset: bool = False


@router.post("/session")
async def demo_session(body: DemoRequest, db: DbDep, user: UserDep) -> dict:
    settings = get_settings()
    if not settings.demo_enabled:
        raise HTTPException(status_code=403, detail="Demo workspace is disabled on this deployment.")

    if body.reset:
        await reset_user_data(user.id, db)

    has_spaces = await db.fetchval("select 1 from public.spaces where user_id = auth.uid() limit 1")
    if has_spaces and not body.reset:
        space_id = await db.fetchval(
            "select id from public.spaces where user_id = auth.uid() order by created_at limit 1"
        )
        return {
            "space_id": str(space_id),
            "already_seeded": True,
            "reset": False,
        }

    result = await seed_demo(user.id, db)
    result["already_seeded"] = False
    return result

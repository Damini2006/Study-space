"""MCP personal access tokens (revocable, scope-limited)."""

from __future__ import annotations

import hashlib
import secrets
import uuid

from fastapi import APIRouter, HTTPException

from studyspace.config import get_settings
from studyspace.deps import DbDep, UserDep
from studyspace.models.mcp import McpTokenCreate, McpTokenCreated, McpTokenOut

router = APIRouter(prefix="/me/mcp-tokens", tags=["mcp"])


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _to_out(row) -> McpTokenOut:
    return McpTokenOut(
        id=row["id"],
        name=row["name"],
        token_prefix=row["token_prefix"],
        scopes=list(row["scopes"] or []),
        last_used_at=row["last_used_at"],
        revoked_at=row["revoked_at"],
        created_at=row["created_at"],
    )


@router.get("", response_model=list[McpTokenOut])
async def list_tokens(db: DbDep, user: UserDep) -> list[McpTokenOut]:
    rows = await db.fetch(
        "select id, name, token_prefix, scopes, last_used_at, revoked_at, created_at "
        "from public.mcp_tokens where user_id = auth.uid() order by created_at desc"
    )
    return [_to_out(r) for r in rows]


@router.post("", response_model=McpTokenCreated, status_code=201)
async def create_token(body: McpTokenCreate, db: DbDep, user: UserDep) -> McpTokenCreated:
    settings = get_settings()
    secret = settings.mcp_token_prefix + secrets.token_urlsafe(32)
    row = await db.fetchrow(
        "insert into public.mcp_tokens (user_id, name, token_hash, token_prefix, scopes) "
        "values ($1, $2, $3, $4, $5) "
        "returning id, name, token_prefix, scopes, last_used_at, revoked_at, created_at",
        user.id, body.name, hash_token(secret), secret[:11], body.scopes,
    )
    out = McpTokenCreated(**_to_out(row).model_dump(), token=secret)
    return out


@router.delete("/{token_id}", status_code=204)
async def revoke_token(db: DbDep, user: UserDep, token_id: uuid.UUID) -> None:
    result = await db.execute(
        "update public.mcp_tokens set revoked_at = now() where id = $1 and user_id = auth.uid() and revoked_at is null",
        token_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Token not found.")

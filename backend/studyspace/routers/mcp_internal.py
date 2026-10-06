"""MCP token verification endpoint for the MCP server to call."""

from fastapi import APIRouter, HTTPException

from studyspace.db_service import service_conn

router = APIRouter(prefix="/me/mcp-tokens", tags=["mcp-internal"])


@router.get("/verify-by-hash")
async def verify_by_hash(token_hash: str):
    """Verify an MCP token by its SHA256 hash (called by MCP server)."""
    async with service_conn() as conn:
        row = await conn.fetchrow(
            "select user_id, scopes from public.mcp_tokens "
            "where token_hash = $1 and revoked_at is null",
            token_hash,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Token not found or revoked")
    return {"user_id": str(row["user_id"]), "scopes": list(row["scopes"] or [])}
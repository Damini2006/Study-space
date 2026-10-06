"""FastAPI dependencies: JWT verification, user-scoped DB, rate limits."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Annotated, Any

import asyncpg
from fastapi import Depends, Header, HTTPException, Request, status

from studyspace.db import user_conn
from studyspace.rate_limit import rate_limit
from studyspace.security import AuthError, VerifiedUser, verify_token


async def get_verified_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> VerifiedUser:
    """Verify the Supabase JWT on **every** request (401 when missing/invalid)."""
    cached = getattr(request.state, "verified_user", None)
    if cached is not None:
        return cached
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        user = await verify_token(token)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    request.state.verified_user = user
    return user


UserDep = Annotated[VerifiedUser, Depends(get_verified_user)]


async def get_user_db(user: UserDep) -> AsyncIterator[asyncpg.Connection]:
    """Yield a Postgres connection bound to the verified user (RLS applies)."""
    async with user_conn(user.claims) as conn:
        yield conn


DbDep = Annotated[asyncpg.Connection, Depends(get_user_db)]


def require_rate_limit(limit: int, window_seconds: int, scope: str) -> Callable[[], Any]:
    """Build a dependency that throttles ``scope`` for the current identity."""

    async def _dep(request: Request, user: UserDep) -> None:
        ident = getattr(user, "id", None) or (request.client.host if request.client else "anon")
        result = await rate_limit(f"{scope}:{ident}", limit, window_seconds)
        if not result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests for '{scope}'. Try again in {result.retry_after}s.",
                headers={"Retry-After": str(result.retry_after)},
            )

    return _dep


def require_admin(user: UserDep) -> VerifiedUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return user


AdminDep = Annotated[VerifiedUser, Depends(require_admin)]


__all__ = [
    "AdminDep",
    "DbDep",
    "UserDep",
    "get_user_db",
    "get_verified_user",
    "require_admin",
    "require_rate_limit",
]

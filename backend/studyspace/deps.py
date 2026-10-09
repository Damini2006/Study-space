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


# What the link-resolving endpoints run as: no subject at all, so
# auth.uid() is null and every "own rows" policy stays closed.
_ANON_CLAIMS: dict[str, Any] = {"sub": "", "role": "anon"}


async def get_public_db() -> AsyncIterator[asyncpg.Connection]:
    """Connection for the two link-resolving endpoints (published pages,
    invite links).

    These routes answer for *anyone holding the URL*, so they deliberately
    ignore any presented bearer token: the view a link shows must not
    depend on who is signed in while opening it. Anonymous claims keep row
    level security fully on — the only rows that can come back live inside
    the SECURITY DEFINER functions of migration 0013, which re-validate
    the slug/token in the same statement that reads the data.
    """
    async with user_conn(_ANON_CLAIMS) as conn:
        yield conn


DbDep = Annotated[asyncpg.Connection, Depends(get_user_db)]
PublicDbDep = Annotated[asyncpg.Connection, Depends(get_public_db)]


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
    "PublicDbDep",
    "UserDep",
    "get_public_db",
    "get_user_db",
    "get_verified_user",
    "require_admin",
    "require_rate_limit",
]

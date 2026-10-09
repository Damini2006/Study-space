"""Personal access tokens (``ssk_...``) as API credentials.

A token presented as a bearer resolves to the same identity shape a
session JWT produces — id + claims, Row Level Security applying per
request — so no route ever learns it is talking to a token holder. What
a token carries besides identity is its *scopes*: :func:`required_scope`
maps an HTTP method onto the scope it demands, which is how
"scope-limited" in the Settings panel stops being copy and becomes
enforcement.

Verification answers the only question knowable before identity exists:
"does this exact hash belong to a live token". That lookup is the one
cross-user read outside RLS, so it runs as ``public.verify_mcp_token``
(SECURITY DEFINER, migration 0014) over a user-scoped connection under
anonymous claims — the same path every other query in this project takes.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from studyspace.db import user_conn

# A request that has proven nothing has no subject — the same anonymous
# claims deps.get_public_db runs its link-resolving queries as.
_ANON_CLAIMS: dict[str, Any] = {"sub": "", "role": "anon"}


@dataclass(frozen=True)
class PatIdentity:
    """A live token: who holds it, and what it may do."""

    user_id: str
    scopes: frozenset[str]


def hash_mcp_token(token: str) -> str:
    """The stored form of a token — only the sha256 ever reaches the database."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def verify_pat(token: str) -> PatIdentity | None:
    """Resolve a token to its holder, or None when it is unknown or revoked.

    Indistinguishable by design: a prober learns nothing about which half
    of "not a token" it hit.
    """
    async with user_conn(dict(_ANON_CLAIMS)) as conn:
        row = await conn.fetchrow(
            "select user_id, scopes from public.verify_mcp_token($1)",
            hash_mcp_token(token),
        )
    if row is None:
        return None
    return PatIdentity(
        user_id=str(row["user_id"]),
        scopes=frozenset(row["scopes"] or ()),
    )


def required_scope(method: str) -> str:
    """The scope an HTTP method requires of a token.

    Reads need ``read``; everything that can change state needs ``write``.
    One rule instead of a per-route table that would rot as routes change.
    """
    return "read" if method in ("GET", "HEAD") else "write"

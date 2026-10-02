"""MCP personal access token models."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Scope = Literal["read", "write"]


class McpTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[Scope] = Field(default_factory=lambda: ["read"], max_length=2)


class McpTokenOut(BaseModel):
    id: uuid.UUID
    name: str
    token_prefix: str
    scopes: list[str] = Field(default_factory=list)
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class McpTokenCreated(McpTokenOut):
    """Returned exactly once, at creation time — contains the secret."""

    token: str

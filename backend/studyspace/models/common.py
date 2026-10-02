"""Shared response shapes."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OkResponse(BaseModel):
    ok: bool = True


class ErrorResponse(BaseModel):
    detail: str = Field(examples=["Something went wrong."])


class Page(BaseModel):
    total: int = 0
    limit: int = 50
    offset: int = 0

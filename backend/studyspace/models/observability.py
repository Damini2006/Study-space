"""Payloads for client-side observability reports."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ClientErrorIn(BaseModel):
    """A browser's account of something that went wrong.

    The caps here are the outer guard: nothing this large is a plausible
    report, and a 422 is cheaper than running the scrubbing regexes over
    a megabyte. Useful-but-long reports are not rejected — the router
    truncates them to its own, smaller caps instead, because a 422 would
    silently discard the very report it was sent to deliver.
    """

    message: str = Field(max_length=20_000)
    stack: str | None = Field(default=None, max_length=100_000)
    route: str | None = Field(default=None, max_length=2_000)
    source: Literal["uncaught", "rejection", "boundary"] = "uncaught"

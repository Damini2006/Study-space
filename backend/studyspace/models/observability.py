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


class VitalsIn(BaseModel):
    """Field performance for one page load.

    The ranges are sanity gates, not quality gates: FCP and LCP up to an
    hour — a real number from a pathologically slow device is still a
    real number — and CLS up to 10, because genuinely terrible pages
    exceed 1 legitimately and rejecting them would delete the worst data
    first. Every field is optional: a browser that observed nothing says
    so, and `none` in the log is an answer too.
    """

    fcp_ms: float | None = Field(default=None, ge=0, le=3_600_000)
    lcp_ms: float | None = Field(default=None, ge=0, le=3_600_000)
    cls: float | None = Field(default=None, ge=0, le=10)
    route: str | None = Field(default=None, max_length=2_000)

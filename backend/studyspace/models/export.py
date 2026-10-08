"""Space export (streams) and import (what the import actually did)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ImportSummary(BaseModel):
    """Result of a synchronous import.

    Counts come from parsing this very request: nothing is queued for later,
    so ``sources``/``cards`` are what exist by the time the 201 is returned,
    and ``skipped``/``warnings`` say what was left out and why.
    """

    format: str
    sources: int = 0
    cards: int = 0
    skipped: int = 0
    warnings: list[str] = Field(default_factory=list)

"""Sources (uploaded PDF/DOCX/TXT/MD files or pasted text)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SourceType = Literal["pdf", "docx", "text", "markdown", "url", "youtube"]
SourceStatus = Literal["queued", "processing", "ready", "failed"]


class SourceOut(BaseModel):
    id: uuid.UUID
    space_id: uuid.UUID
    type: SourceType
    title: str
    status: SourceStatus
    error: str | None = None
    size_bytes: int = 0
    char_count: int = 0
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PastedTextInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=100_000)
    markdown: bool = False


class UploadResponse(BaseModel):
    source: SourceOut
    job_queued: bool = True

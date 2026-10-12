"""Vision board items (drag stickies + images, ported from the prototype)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class VisionItemCreate(BaseModel):
    kind: str = Field(default="sticky", pattern=r"^(sticky|image)$")
    text: str = Field(default="", max_length=2000)
    color: str = Field(default="#FFF9B3", pattern=r"^#[0-9A-Fa-f]{6}$")
    x: float = Field(default=0, ge=-20000, le=20000)
    y: float = Field(default=0, ge=-20000, le=20000)
    width: float = Field(default=200, ge=60, le=4000)
    height: float = Field(default=160, ge=60, le=4000)
    rotation: float = Field(default=0, ge=-360, le=360)
    z_index: int = Field(default=0, ge=0, le=100000)
    image_path: str | None = Field(default=None, max_length=500)
    board_id: uuid.UUID | None = None


class VisionItemUpdate(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    x: float | None = Field(default=None, ge=-20000, le=20000)
    y: float | None = Field(default=None, ge=-20000, le=20000)
    width: float | None = Field(default=None, ge=60, le=4000)
    height: float | None = Field(default=None, ge=60, le=4000)
    rotation: float | None = Field(default=None, ge=-360, le=360)
    z_index: int | None = Field(default=None, ge=0, le=100000)
    board_id: uuid.UUID | None = None


class VisionItemOut(BaseModel):
    id: uuid.UUID
    kind: str
    text: str
    color: str
    x: float
    y: float
    width: float
    height: float
    rotation: float
    z_index: int
    image_path: str | None = None
    image_url: str | None = None  # short-lived signed URL when kind == image
    board_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VisionBoardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class VisionBoardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)


class VisionBoardOut(BaseModel):
    id: uuid.UUID
    name: str
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

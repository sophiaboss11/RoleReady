from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class VideoGenerateRequest(BaseModel):
    project_id: UUID
    # All other generation parameters are resolved server-side (see Settings).


class ProjectVideoResponse(BaseModel):
    id: str
    project_id: str
    video_url: Optional[str]
    prompt: str
    retrieved_count: int = Field(default=0, ge=0)
    slide_count: int = Field(default=0, ge=0)
    warning: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_processed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VideoGenerationResponse(BaseModel):
    video_url: str
    retrieved_count: int = Field(default=0, ge=0)
    slide_count: int = Field(default=0, ge=0)
    warning: Optional[str] = None

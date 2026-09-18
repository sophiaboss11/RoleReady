from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ArchitectureGenerateRequest(BaseModel):
    project_id: UUID = Field(..., description="Project to generate architecture buckets for")


class ArchitectureResponse(BaseModel):
    id: str
    project_id: str
    timestamp: datetime
    frontend: list[str] = Field(default_factory=list)
    application: list[str] = Field(default_factory=list)
    data: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True

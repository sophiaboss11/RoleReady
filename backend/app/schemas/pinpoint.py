from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PinpointGenerateRequest(BaseModel):
    project_id: UUID = Field(..., description="Project to generate pinpoint questions for")
    question_count: int = Field(default=10, ge=1, le=20, description="Number of questions to generate")


class PinpointQuestionResponse(BaseModel):
    id: str
    project_id: str
    timestamp: datetime
    clue_1: str
    clue_2: str
    clue_3: str
    answer: str

    class Config:
        from_attributes = True


class PinpointGenerationResponse(BaseModel):
    project_id: str
    question_count: int
    questions: list[PinpointQuestionResponse] = Field(default_factory=list)

from pydantic import BaseModel, Field
from typing import Literal
from uuid import UUID

PromptType = Literal["narration", "mindmap", "infographic_text", "summary"]


class PromptUpsertRequest(BaseModel):
    project_id: UUID
    prompt_type: PromptType
    instruction: str = Field(..., min_length=1, max_length=5000)

"""Schemas for the curriculum system.

Covers training_lesson, lesson_step, and lesson_dependency
which represent the Duolingo-style hierarchical learning path.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


LessonUnlockRule = Literal["sequential", "manual", "always_open"]
StepType = Literal["video", "audio", "document", "quiz", "infographic", "mindmap", "summary", "exercise"]


# ---------------------------------------------------------------------------
# Training Lesson
# ---------------------------------------------------------------------------

class TrainingLessonCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    sort_order: int = Field(default=0, ge=0)
    is_required: bool = Field(default=True)
    unlock_rule: LessonUnlockRule = Field(default="sequential")
    estimated_duration_minutes: Optional[int] = Field(None, ge=1)


class TrainingLessonUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    sort_order: Optional[int] = Field(None, ge=0)
    is_required: Optional[bool] = None
    unlock_rule: Optional[LessonUnlockRule] = None
    estimated_duration_minutes: Optional[int] = Field(None, ge=1)


class TrainingLessonResponse(BaseModel):
    id: str
    training_id: str
    title: str
    description: Optional[str]
    sort_order: int
    is_required: bool
    unlock_rule: LessonUnlockRule
    estimated_duration_minutes: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Lesson Step
# ---------------------------------------------------------------------------

class LessonStepCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    step_type: StepType
    sort_order: int = Field(default=0, ge=0)
    content_url: Optional[str] = None
    content_body: Optional[str] = None
    is_required: bool = Field(default=True)
    is_scorable: bool = Field(default=False)
    max_score: Optional[int] = Field(None, ge=0)
    pass_threshold: Optional[int] = Field(None, ge=0, le=100)
    estimated_duration_minutes: Optional[int] = Field(None, ge=1)


class LessonStepUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    step_type: Optional[StepType] = None
    sort_order: Optional[int] = Field(None, ge=0)
    content_url: Optional[str] = None
    content_body: Optional[str] = None
    is_required: Optional[bool] = None
    is_scorable: Optional[bool] = None
    max_score: Optional[int] = Field(None, ge=0)
    pass_threshold: Optional[int] = Field(None, ge=0, le=100)
    estimated_duration_minutes: Optional[int] = Field(None, ge=1)


class LessonStepResponse(BaseModel):
    id: str
    lesson_id: str
    title: str
    description: Optional[str]
    step_type: StepType
    sort_order: int
    content_url: Optional[str]
    content_body: Optional[str]
    is_required: bool
    is_scorable: bool
    max_score: Optional[int]
    pass_threshold: Optional[int]
    estimated_duration_minutes: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Lesson Dependency
# ---------------------------------------------------------------------------

class LessonDependencyCreate(BaseModel):
    prerequisite_id: UUID


class LessonDependencyResponse(BaseModel):
    id: str
    lesson_id: str
    prerequisite_id: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Curriculum Overview (read model)
# ---------------------------------------------------------------------------

class LessonWithStepsResponse(TrainingLessonResponse):
    steps: list[LessonStepResponse] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)


class CurriculumOverviewResponse(BaseModel):
    training_id: str
    lessons: list[LessonWithStepsResponse] = Field(default_factory=list)

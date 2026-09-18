"""Schemas for learner progress snapshots and unlock state."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


LearnerTrainingStatus = Literal["not_started", "in_progress", "completed"]
LearnerLessonStatus = Literal["locked", "available", "in_progress", "completed", "mastered"]
LearnerStepStatus = Literal["not_started", "in_progress", "completed"]


class LearnerTrainingProgressResponse(BaseModel):
    user_id: str
    training_id: str
    status: LearnerTrainingStatus
    progress_pct: int
    completed_lessons: int
    total_lessons: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_active_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class LearnerLessonProgressResponse(BaseModel):
    user_id: str
    lesson_id: str
    training_id: str
    status: LearnerLessonStatus
    progress_pct: int
    completed_steps: int
    total_steps: int
    best_score: Optional[int]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class LearnerStepProgressResponse(BaseModel):
    user_id: str
    step_id: str
    lesson_id: str
    status: LearnerStepStatus
    progress_pct: int
    best_score: Optional[int]
    best_max_score: Optional[int]
    attempts: int
    watch_seconds: int
    listen_seconds: int
    last_position_seconds: Optional[int]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class LearnerPathOverviewResponse(BaseModel):
    training_progress: LearnerTrainingProgressResponse
    lesson_progress: list[LearnerLessonProgressResponse] = Field(default_factory=list)

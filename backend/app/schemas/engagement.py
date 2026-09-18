"""Schemas for engagement tracking.

Covers learning sessions, events, and step attempts.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


SessionStatus = Literal["active", "paused", "completed", "abandoned"]
EventType = Literal[
    "session_start", "session_end", "session_pause", "session_resume",
    "step_open", "step_complete",
    "play", "pause", "seek", "playback_end",
    "heartbeat",
    "answer_submit", "quiz_complete",
    "lesson_complete", "training_complete",
]


# ---------------------------------------------------------------------------
# Learning Session
# ---------------------------------------------------------------------------

class LearningSessionCreate(BaseModel):
    training_id: UUID
    lesson_id: Optional[UUID] = None
    step_id: Optional[UUID] = None


class LearningSessionUpdate(BaseModel):
    status: Optional[SessionStatus] = None
    lesson_id: Optional[UUID] = None
    step_id: Optional[UUID] = None


class LearningSessionResponse(BaseModel):
    id: str
    user_id: str
    training_id: str
    lesson_id: Optional[str]
    step_id: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    status: SessionStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Learning Event
# ---------------------------------------------------------------------------

class LearningEventCreate(BaseModel):
    session_id: UUID
    event_type: EventType
    step_id: Optional[UUID] = None
    payload: dict = Field(default_factory=dict)


class LearningEventBatchCreate(BaseModel):
    events: list[LearningEventCreate] = Field(..., min_length=1, max_length=100)


class LearningEventResponse(BaseModel):
    id: str
    session_id: str
    user_id: str
    event_type: EventType
    step_id: Optional[str]
    payload: dict
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Step Attempt
# ---------------------------------------------------------------------------

class StepAttemptCreate(BaseModel):
    step_id: UUID
    session_id: Optional[UUID] = None
    answer_payload: dict = Field(default_factory=dict)


class StepAttemptComplete(BaseModel):
    score: Optional[int] = Field(None, ge=0)
    max_score: Optional[int] = Field(None, ge=0)
    passed: Optional[bool] = None
    answer_payload: Optional[dict] = None


class StepAttemptResponse(BaseModel):
    id: str
    user_id: str
    step_id: str
    session_id: Optional[str]
    attempt_number: int
    score: Optional[int]
    max_score: Optional[int]
    passed: Optional[bool]
    answer_payload: dict
    started_at: datetime
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True

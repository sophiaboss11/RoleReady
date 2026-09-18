"""Schemas for social features: leaderboards and challenges."""

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


ChallengeType = Literal["individual", "team"]
ChallengeStatus = Literal["draft", "active", "completed", "cancelled"]
ChallengeMetric = Literal[
    "xp_earned", "lessons_completed", "steps_completed",
    "watch_seconds", "listen_seconds", "quiz_attempts", "streak_days",
]
LeaderboardPeriod = Literal["weekly", "monthly", "all_time"]


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------

class LeaderboardEntryResponse(BaseModel):
    rank: int
    user_id: str
    xp_earned: int
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class LeaderboardResponse(BaseModel):
    organization_id: str
    period_type: LeaderboardPeriod
    period_start: date
    period_end: date
    entries: list[LeaderboardEntryResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Challenge
# ---------------------------------------------------------------------------

class ChallengeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    challenge_type: ChallengeType = "individual"
    target_value: int = Field(..., gt=0)
    metric: ChallengeMetric
    start_date: date
    end_date: date
    reward_xp: int = Field(default=0, ge=0)


class ChallengeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[ChallengeStatus] = None


class ChallengeResponse(BaseModel):
    id: str
    organization_id: str
    title: str
    description: Optional[str]
    challenge_type: ChallengeType
    target_value: int
    metric: ChallengeMetric
    start_date: date
    end_date: date
    reward_xp: int
    status: ChallengeStatus
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChallengeParticipationResponse(BaseModel):
    id: str
    challenge_id: str
    user_id: str
    current_value: int
    completed: bool
    completed_at: Optional[datetime]
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class ChallengeDetailResponse(ChallengeResponse):
    participants: list[ChallengeParticipationResponse] = Field(default_factory=list)
    viewer_participation: Optional[ChallengeParticipationResponse] = None

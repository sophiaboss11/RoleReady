"""Schemas for the gamification system.

Covers XP, levels, streaks, daily activity, and learner profiles.
"""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


XpReason = Literal[
    "lesson_complete", "step_complete", "quiz_perfect",
    "quiz_pass", "streak_bonus", "daily_goal",
    "challenge_complete", "first_lesson", "training_complete",
    "review_complete", "admin_grant", "anti_abuse_correction",
]

XpSourceType = Literal["step", "lesson", "training", "challenge", "streak", "quiz", "system"]


# ---------------------------------------------------------------------------
# XP Economy Rules
# ---------------------------------------------------------------------------
XP_RULES: dict[str, int] = {
    "step_complete": 25,
    "lesson_complete": 100,
    "training_complete": 500,
    "quiz_pass": 50,
    "quiz_perfect": 100,
    "streak_bonus_3": 50,
    "streak_bonus_7": 150,
    "streak_bonus_30": 500,
    "daily_goal": 25,
    "first_lesson": 50,
    "review_complete": 25,
}

# Daily XP cap to prevent abuse
DAILY_XP_CAP = 2000


def compute_level(total_xp: int) -> int:
    """Level formula: floor(sqrt(total_xp / 100)) + 1"""
    if total_xp <= 0:
        return 1
    import math
    return max(1, int(math.floor(math.sqrt(total_xp / 100))) + 1)


def xp_for_level(level: int) -> int:
    """XP required to reach a given level."""
    if level <= 1:
        return 0
    return (level - 1) ** 2 * 100


def xp_to_next_level(total_xp: int) -> int:
    """XP remaining to reach the next level."""
    current_level = compute_level(total_xp)
    next_level_xp = xp_for_level(current_level + 1)
    return max(0, next_level_xp - total_xp)


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------

class XpLedgerEntryResponse(BaseModel):
    id: str
    user_id: str
    amount: int
    reason: XpReason
    source_type: XpSourceType
    source_id: Optional[str]
    training_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class GamificationProfileResponse(BaseModel):
    user_id: str
    total_xp: int
    level: int
    xp_to_next_level: int
    current_streak_days: int
    longest_streak_days: int
    total_watch_seconds: int
    total_listen_seconds: int
    total_lessons_completed: int
    total_steps_completed: int
    quiz_accuracy_pct: int
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class DailyActivityResponse(BaseModel):
    id: str
    user_id: str
    activity_date: date
    xp_earned: int
    lessons_completed: int
    steps_completed: int
    watch_seconds: int
    listen_seconds: int
    quiz_attempts: int

    class Config:
        from_attributes = True


class XpGrantRequest(BaseModel):
    user_id: str
    amount: int = Field(..., ge=1, le=10000)
    reason: XpReason
    source_type: XpSourceType = "system"
    source_id: Optional[str] = None
    training_id: Optional[str] = None


class DailyGoalStatus(BaseModel):
    target_xp: int
    earned_xp: int
    completed: bool
    streak_days: int

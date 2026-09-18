from __future__ import annotations

from app.repositories.gamification_repository import GamificationRepository
from app.repositories.types import (
    DailyActivityRow,
    LearnerGamificationProfileRow,
    XpLedgerRow,
)
from app.schemas.gamification import compute_level, xp_to_next_level


def get_gamification_profile(
    repo: GamificationRepository,
    user_id: str,
) -> dict:
    profile = repo.get_profile(user_id)
    if profile is None:
        return _empty_profile(user_id)
    return _enrich_profile(profile)


def list_xp_history(
    repo: GamificationRepository,
    *,
    user_id: str,
    limit: int = 100,
    offset: int = 0,
) -> list[XpLedgerRow]:
    return repo.list_xp_ledger(user_id=user_id, limit=limit, offset=offset)


def get_daily_goal_status(
    repo: GamificationRepository,
    *,
    user_id: str,
    activity_date: str,
    daily_target_xp: int = 100,
) -> dict:
    activity = repo.get_daily_activity(user_id=user_id, activity_date=activity_date)
    earned = activity["xp_earned"] if activity else 0
    profile = repo.get_profile(user_id)
    streak = profile["current_streak_days"] if profile else 0

    return {
        "target_xp": daily_target_xp,
        "earned_xp": earned,
        "completed": earned >= daily_target_xp,
        "streak_days": streak,
    }


def list_daily_activity(
    repo: GamificationRepository,
    *,
    user_id: str,
    from_date: str,
    to_date: str,
) -> list[DailyActivityRow]:
    return repo.list_daily_activity(
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
    )


def _enrich_profile(profile: LearnerGamificationProfileRow) -> dict:
    total_xp = profile.get("total_xp", 0)
    quiz_total = profile.get("quiz_total_score", 0)
    quiz_max = profile.get("quiz_total_max_score", 0)
    return {
        **profile,
        "level": compute_level(total_xp),
        "xp_to_next_level": xp_to_next_level(total_xp),
        "quiz_accuracy_pct": round(quiz_total / quiz_max * 100) if quiz_max > 0 else 0,
    }


def _empty_profile(user_id: str) -> dict:
    return {
        "user_id": user_id,
        "total_xp": 0,
        "level": 1,
        "xp_to_next_level": 100,
        "current_streak_days": 0,
        "longest_streak_days": 0,
        "total_watch_seconds": 0,
        "total_listen_seconds": 0,
        "total_lessons_completed": 0,
        "total_steps_completed": 0,
        "quiz_accuracy_pct": 0,
        "quiz_total_score": 0,
        "quiz_total_max_score": 0,
        "updated_at": None,
    }

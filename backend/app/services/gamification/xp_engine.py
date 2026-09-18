"""XP engine: central service for granting XP with anti-abuse checks."""

from __future__ import annotations

from datetime import date

from app.repositories.gamification_repository import GamificationRepository
from app.repositories.types import XpLedgerRow
from app.schemas.gamification import DAILY_XP_CAP, XP_RULES


def grant_xp_for_step_complete(
    repo: GamificationRepository,
    *,
    user_id: str,
    step_id: str,
    training_id: str | None = None,
) -> XpLedgerRow | None:
    amount = XP_RULES["step_complete"]
    if not _check_daily_cap(repo, user_id=user_id, amount=amount):
        return None
    return repo.grant_xp(
        user_id=user_id,
        amount=amount,
        reason="step_complete",
        source_type="step",
        source_id=step_id,
        training_id=training_id,
    )


def grant_xp_for_lesson_complete(
    repo: GamificationRepository,
    *,
    user_id: str,
    lesson_id: str,
    training_id: str | None = None,
) -> XpLedgerRow | None:
    amount = XP_RULES["lesson_complete"]
    if not _check_daily_cap(repo, user_id=user_id, amount=amount):
        return None
    return repo.grant_xp(
        user_id=user_id,
        amount=amount,
        reason="lesson_complete",
        source_type="lesson",
        source_id=lesson_id,
        training_id=training_id,
    )


def grant_xp_for_training_complete(
    repo: GamificationRepository,
    *,
    user_id: str,
    training_id: str,
) -> XpLedgerRow | None:
    amount = XP_RULES["training_complete"]
    if not _check_daily_cap(repo, user_id=user_id, amount=amount):
        return None
    return repo.grant_xp(
        user_id=user_id,
        amount=amount,
        reason="training_complete",
        source_type="training",
        source_id=training_id,
        training_id=training_id,
    )


def grant_xp_for_quiz(
    repo: GamificationRepository,
    *,
    user_id: str,
    step_id: str,
    score: int,
    max_score: int,
    training_id: str | None = None,
) -> XpLedgerRow | None:
    if max_score <= 0:
        return None

    accuracy = score / max_score
    if accuracy >= 1.0:
        amount = XP_RULES["quiz_perfect"]
        reason = "quiz_perfect"
    elif accuracy >= 0.7:
        amount = XP_RULES["quiz_pass"]
        reason = "quiz_pass"
    else:
        return None

    if not _check_daily_cap(repo, user_id=user_id, amount=amount):
        return None

    return repo.grant_xp(
        user_id=user_id,
        amount=amount,
        reason=reason,
        source_type="quiz",
        source_id=step_id,
        training_id=training_id,
    )


def grant_streak_bonus(
    repo: GamificationRepository,
    *,
    user_id: str,
    streak_days: int,
) -> XpLedgerRow | None:
    if streak_days == 3:
        amount = XP_RULES["streak_bonus_3"]
    elif streak_days == 7:
        amount = XP_RULES["streak_bonus_7"]
    elif streak_days == 30:
        amount = XP_RULES["streak_bonus_30"]
    else:
        return None

    return repo.grant_xp(
        user_id=user_id,
        amount=amount,
        reason="streak_bonus",
        source_type="streak",
        source_id=f"{date.today().isoformat()}:{streak_days}",
    )


def recalculate_streak(
    repo: GamificationRepository,
    user_id: str,
) -> int:
    streak = repo.recalculate_streak(user_id)
    if streak in (3, 7, 30):
        grant_streak_bonus(repo, user_id=user_id, streak_days=streak)
    return streak


def _check_daily_cap(
    repo: GamificationRepository,
    *,
    user_id: str,
    amount: int,
) -> bool:
    today = date.today().isoformat()
    current_daily = repo.get_daily_xp_total(user_id=user_id, date_str=today)
    return (current_daily + amount) <= DAILY_XP_CAP

"""Gamification API endpoints for XP, levels, streaks, and profiles.

Authorization rules:
- Own profile/history/activity: any authenticated user (scoped to JWT user).
- Other user's profile: requires same-org membership.
- Streak recalculation: own only.
"""

from typing import List, Optional

from fastapi import APIRouter, Query

from app.core.auth import CurrentUser, assert_users_share_organization
from app.repositories.factory import build_gamification_repository
from app.schemas.gamification import (
    DailyActivityResponse,
    DailyGoalStatus,
    GamificationProfileResponse,
    XpLedgerEntryResponse,
)
from app.services.gamification.queries import (
    get_daily_goal_status,
    get_gamification_profile,
    list_daily_activity,
    list_xp_history,
)
from app.services.gamification.xp_engine import recalculate_streak

router = APIRouter()


@router.get("/profile", response_model=GamificationProfileResponse)
async def get_profile(user: CurrentUser):
    data = get_gamification_profile(
        build_gamification_repository(),
        user.user_id,
    )
    return GamificationProfileResponse(**data)


@router.get("/profile/{user_id}", response_model=GamificationProfileResponse)
async def get_user_profile(user_id: str, user: CurrentUser):
    await assert_users_share_organization(user.user_id, user_id)
    data = get_gamification_profile(
        build_gamification_repository(),
        user_id,
    )
    return GamificationProfileResponse(**data)


@router.get("/xp-history", response_model=List[XpLedgerEntryResponse])
async def get_xp_history(
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    rows = list_xp_history(
        build_gamification_repository(),
        user_id=user.user_id,
        limit=limit,
        offset=offset,
    )
    return [XpLedgerEntryResponse(**row) for row in rows]


@router.get("/daily-goal", response_model=DailyGoalStatus)
async def get_daily_goal(
    user: CurrentUser,
    date: Optional[str] = Query(None, description="ISO date, defaults to today"),
):
    from datetime import date as date_type
    activity_date = date or date_type.today().isoformat()
    data = get_daily_goal_status(
        build_gamification_repository(),
        user_id=user.user_id,
        activity_date=activity_date,
    )
    return DailyGoalStatus(**data)


@router.get("/daily-activity", response_model=List[DailyActivityResponse])
async def get_daily_activity_range(
    user: CurrentUser,
    from_date: str = Query(..., description="Start date (ISO)"),
    to_date: str = Query(..., description="End date (ISO)"),
):
    rows = list_daily_activity(
        build_gamification_repository(),
        user_id=user.user_id,
        from_date=from_date,
        to_date=to_date,
    )
    return [DailyActivityResponse(**row) for row in rows]


@router.post("/streak/recalculate")
async def trigger_streak_recalculation(user: CurrentUser):
    streak = recalculate_streak(
        build_gamification_repository(),
        user.user_id,
    )
    return {"streak_days": streak}

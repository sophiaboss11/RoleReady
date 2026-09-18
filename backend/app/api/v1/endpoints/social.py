"""Social API endpoints for leaderboards and challenges.

Authorization rules:
- Leaderboard: org members can view.
- Challenge list/detail: org members can view.
- Challenge create/update: org admins only.
- Challenge join: org members.
"""

from datetime import date, timedelta
from typing import List, Optional
from uuid import UUID

import uuid as uuid_mod

from fastapi import APIRouter, HTTPException, Query

from app.core.auth import (
    CurrentUser,
    OrganizationAdminAccess,
    OrganizationMemberAccess,
    check_member_of_organization,
)
from app.repositories.factory import build_gamification_repository
from app.repositories.factory import build_social_repository
from app.schemas.social import (
    ChallengeCreate,
    ChallengeDetailResponse,
    ChallengeParticipationResponse,
    ChallengeResponse,
    ChallengeUpdate,
    LeaderboardEntryResponse,
    LeaderboardPeriod,
    LeaderboardResponse,
)

router = APIRouter()

ALL_TIME_START_DATE = date(2020, 1, 1)


def _resolve_period_window(period_type: LeaderboardPeriod, *, today: date) -> tuple[date, date]:
    if period_type == "weekly":
        period_start = today - timedelta(days=today.weekday())
        return period_start, period_start + timedelta(days=6)
    if period_type == "monthly":
        period_start = today.replace(day=1)
        next_month = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
        return period_start, next_month - timedelta(days=1)
    return ALL_TIME_START_DATE, today


def _build_all_time_entries(
    organization_id: str,
    *,
    limit: int = 100,
) -> list[LeaderboardEntryResponse]:
    social_repo = build_social_repository()
    gamification_repo = build_gamification_repository()

    profile_rows = gamification_repo.list_profiles_by_org(
        organization_id=organization_id,
        limit=limit,
    )
    ranked_rows = [row for row in profile_rows if row.get("total_xp", 0) > 0]
    user_ids = [row["user_id"] for row in ranked_rows]
    profiles = social_repo.list_profiles(user_ids)

    return [
        LeaderboardEntryResponse(
            rank=index + 1,
            user_id=row["user_id"],
            xp_earned=row["total_xp"],
            display_name=profiles.get(row["user_id"], {}).get("display_name"),
            avatar_url=profiles.get(row["user_id"], {}).get("avatar_url"),
        )
        for index, row in enumerate(ranked_rows)
    ]


# -- Leaderboard ------------------------------------------------------------

@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    access: OrganizationMemberAccess,
    period_type: LeaderboardPeriod = Query(default="weekly"),
):
    today = date.today()
    period_start, period_end = _resolve_period_window(period_type, today=today)

    if period_type == "all_time":
        entries = _build_all_time_entries(access.organization_id)
    else:
        repo = build_social_repository()
        repo.compute_leaderboard(
            organization_id=access.organization_id,
            period_type=period_type,
            period_start=period_start.isoformat(),
            period_end=period_end.isoformat(),
        )

        rows = repo.get_leaderboard(
            organization_id=access.organization_id,
            period_type=period_type,
            period_start=period_start.isoformat(),
        )

        user_ids = [row["user_id"] for row in rows]
        profiles = repo.list_profiles(user_ids)

        entries = [
            LeaderboardEntryResponse(
                rank=row["rank"],
                user_id=row["user_id"],
                xp_earned=row["xp_earned"],
                display_name=profiles.get(row["user_id"], {}).get("display_name"),
                avatar_url=profiles.get(row["user_id"], {}).get("avatar_url"),
            )
            for row in rows
        ]

    return LeaderboardResponse(
        organization_id=access.organization_id,
        period_type=period_type,
        period_start=period_start,
        period_end=period_end,
        entries=entries,
    )


# -- Challenges -------------------------------------------------------------

@router.get("/challenges", response_model=List[ChallengeResponse])
async def list_challenges(
    access: OrganizationMemberAccess,
    status: Optional[str] = Query(None),
):
    rows = build_social_repository().list_challenges(
        organization_id=access.organization_id,
        status=status,
    )
    return [ChallengeResponse(**row) for row in rows]


@router.post("/challenges", response_model=ChallengeResponse)
async def create_challenge(body: ChallengeCreate, access: OrganizationAdminAccess):
    from datetime import datetime

    now = datetime.utcnow().isoformat()
    row = {
        "id": str(uuid_mod.uuid4()),
        "organization_id": access.organization_id,
        "title": body.title,
        "description": body.description,
        "challenge_type": body.challenge_type,
        "target_value": body.target_value,
        "metric": body.metric,
        "start_date": body.start_date.isoformat(),
        "end_date": body.end_date.isoformat(),
        "reward_xp": body.reward_xp,
        "status": "draft",
        "created_by": access.user_id,
        "created_at": now,
        "updated_at": now,
    }
    result = build_social_repository().create_challenge(row)
    return ChallengeResponse(**result)


@router.get("/challenges/{challenge_id}", response_model=ChallengeDetailResponse)
async def get_challenge_detail(challenge_id: UUID, user: CurrentUser):
    repo = build_social_repository()
    challenge = repo.get_challenge(str(challenge_id))

    # Verify caller is member of the challenge's org
    await check_member_of_organization(user.user_id, challenge["organization_id"])

    participants = repo.list_participants(str(challenge_id))
    user_ids = [p["user_id"] for p in participants]
    profiles = repo.list_profiles(user_ids)

    viewer_participation = None
    enriched_participants = []
    for p in participants:
        profile = profiles.get(p["user_id"], {})
        entry = ChallengeParticipationResponse(
            **p,
            display_name=profile.get("display_name"),
            avatar_url=profile.get("avatar_url"),
        )
        enriched_participants.append(entry)
        if p["user_id"] == user.user_id:
            viewer_participation = entry

    return ChallengeDetailResponse(
        **challenge,
        participants=enriched_participants,
        viewer_participation=viewer_participation,
    )


@router.put("/challenges/{challenge_id}", response_model=ChallengeResponse)
async def update_challenge(challenge_id: UUID, body: ChallengeUpdate, user: CurrentUser):
    from datetime import datetime
    from app.core.auth import check_admin_for_organization

    repo = build_social_repository()
    challenge = repo.get_challenge(str(challenge_id))
    await check_admin_for_organization(user.user_id, challenge["organization_id"])

    update_data = {}
    if body.title is not None:
        update_data["title"] = body.title
    if body.description is not None:
        update_data["description"] = body.description
    if body.status is not None:
        update_data["status"] = body.status
    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = repo.update_challenge(str(challenge_id), update_data)
    return ChallengeResponse(**result)


@router.post("/challenges/{challenge_id}/join", response_model=ChallengeParticipationResponse)
async def join_challenge(challenge_id: UUID, user: CurrentUser):
    repo = build_social_repository()
    challenge = repo.get_challenge(str(challenge_id))

    # Verify membership in challenge's org
    await check_member_of_organization(user.user_id, challenge["organization_id"])

    if challenge["status"] != "active":
        raise HTTPException(status_code=400, detail="Challenge is not active")

    row = {
        "id": str(uuid_mod.uuid4()),
        "challenge_id": str(challenge_id),
        "user_id": user.user_id,
        "current_value": 0,
        "completed": False,
    }
    result = repo.join_challenge(row)
    return ChallengeParticipationResponse(**result)

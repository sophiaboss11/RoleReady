"""Manager analytics API endpoints.

Authorization rules:
- Dashboard: org admins only.
"""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter

from app.core.auth import OrganizationAdminAccess
from app.repositories.factory import (
    build_engagement_repository,
    build_gamification_repository,
    build_training_repository,
)
from app.schemas.analytics import (
    AttentionLearnerAnalytics,
    LearnerAnalytics,
    ManagerDashboardResponse,
    TrainingAnalytics,
)
from app.services.training.queries import compute_assignment_progresses

router = APIRouter()

ACTIVE_LEARNER_WINDOW_DAYS = 7
UPCOMING_DUE_WINDOW_DAYS = 7


@router.get("/dashboard", response_model=ManagerDashboardResponse)
async def get_manager_dashboard(access: OrganizationAdminAccess):
    training_repo = build_training_repository()
    gamification_repo = build_gamification_repository()
    engagement_repo = build_engagement_repository()
    now = datetime.now(UTC)
    today = now.date()
    active_from_date = today - timedelta(days=ACTIVE_LEARNER_WINDOW_DAYS - 1)
    active_from_datetime = datetime.combine(
        active_from_date,
        datetime.min.time(),
        tzinfo=UTC,
    )
    due_soon_until = now + timedelta(days=UPCOMING_DUE_WINDOW_DAYS)

    trainings = training_repo.list_trainings(
        project_id=None,
        organization_id=access.organization_id,
        limit=500,
        offset=0,
    )

    training_ids = [t["id"] for t in trainings]
    all_assignments = training_repo.list_assignments(training_ids) if training_ids else []
    all_modules = training_repo.list_modules(training_ids) if training_ids else []
    all_progress = (
        training_repo.list_progress([a["id"] for a in all_assignments])
        if all_assignments else []
    )

    # Compute real assignment progress
    progress_by_assignment = compute_assignment_progresses(
        modules=all_modules,
        assignments=all_assignments,
        progress_rows=all_progress,
    )

    # Build training stats with real averages
    training_stats: list[dict] = []
    for t in trainings:
        t_assignments = [a for a in all_assignments if a["training_id"] == t["id"]]
        started = sum(1 for a in t_assignments if a["status"] in ("in_progress", "completed"))
        completed = sum(1 for a in t_assignments if a["status"] == "completed")
        progress_values = [progress_by_assignment.get(a["id"], 0) for a in t_assignments]
        avg_pct = round(sum(progress_values) / len(progress_values)) if progress_values else 0

        training_stats.append({
            "training_id": t["id"],
            "title": t["title"],
            "total_assigned": len(t_assignments),
            "total_started": started,
            "total_completed": completed,
            "average_progress_pct": avg_pct,
            "average_completion_days": None,
        })

    # Unique learners
    unique_user_ids = list({a["user_id"] for a in all_assignments})
    total_learners = len(unique_user_ids)

    daily_activity_rows = gamification_repo.list_daily_activity_for_users(
        user_ids=unique_user_ids,
        from_date=active_from_date.isoformat(),
        to_date=today.isoformat(),
    )
    recent_sessions = engagement_repo.list_sessions_for_trainings(
        training_ids=training_ids,
        started_from=active_from_datetime.isoformat(),
    )

    active_user_ids = _active_user_ids_in_window(
        daily_activity_rows=daily_activity_rows,
        sessions=recent_sessions,
        from_date=active_from_date,
    )
    progress_values = [progress_by_assignment.get(a["id"], 0) for a in all_assignments]
    completed_assignments = [a for a in all_assignments if a["status"] == "completed"]
    in_progress_assignments = [a for a in all_assignments if a["status"] == "in_progress"]
    not_started_assignments = [a for a in all_assignments if a["status"] == "assigned"]
    overdue_assignments = [
        a for a in all_assignments
        if a["status"] != "completed" and _is_before(a.get("due_date"), now)
    ]
    due_soon_assignments = [
        a for a in all_assignments
        if (
            a["status"] != "completed"
            and _is_between(a.get("due_date"), now, due_soon_until)
        )
    ]
    needs_attention_user_ids = {
        a["user_id"]
        for a in [*overdue_assignments, *not_started_assignments]
        if a.get("user_id")
    }

    display_profiles = training_repo.list_profiles(unique_user_ids) if unique_user_ids else {}

    attention_learners = _build_attention_learners(
        assignments=all_assignments,
        overdue_assignments=overdue_assignments,
        due_soon_assignments=due_soon_assignments,
        progress_by_assignment=progress_by_assignment,
        display_profiles=display_profiles,
    )

    # Top performers from gamification profiles
    top_performers: list[dict] = []
    gam_profiles = gamification_repo.list_profiles(user_ids=unique_user_ids)
    for uid in unique_user_ids:
        gam_profile = gam_profiles.get(uid)
        display_profile = display_profiles.get(uid, {})

        total_xp = gam_profile.get("total_xp", 0) if gam_profile else 0
        quiz_score = gam_profile.get("quiz_total_score", 0) if gam_profile else 0
        quiz_max = gam_profile.get("quiz_total_max_score", 0) if gam_profile else 0
        quiz_acc = round(quiz_score / quiz_max * 100) if quiz_max > 0 else 0

        top_performers.append({
            "user_id": uid,
            "display_name": display_profile.get("display_name"),
            "avatar_url": display_profile.get("avatar_url"),
            "total_xp": total_xp,
            "level": gam_profile.get("level", 1) if gam_profile else 1,
            "streak_days": gam_profile.get("current_streak_days", 0) if gam_profile else 0,
            "trainings_completed": sum(
                1 for a in all_assignments
                if a["user_id"] == uid and a["status"] == "completed"
            ),
            "lessons_completed": gam_profile.get("total_lessons_completed", 0) if gam_profile else 0,
            "quiz_accuracy_pct": quiz_acc,
        })

    top_performers.sort(
        key=lambda performer: (
            performer["total_xp"],
            performer["lessons_completed"],
            performer["trainings_completed"],
        ),
        reverse=True,
    )

    # Overall average completion across all trainings
    all_avg_values = [s["average_progress_pct"] for s in training_stats if s["total_assigned"] > 0]
    avg_completion = round(sum(all_avg_values) / len(all_avg_values)) if all_avg_values else 0
    average_progress_pct = (
        round(sum(progress_values) / len(progress_values))
        if progress_values
        else 0
    )
    engagement_rate_7d_pct = _percentage(len(active_user_ids), total_learners)

    return ManagerDashboardResponse(
        organization_id=access.organization_id,
        total_learners=total_learners,
        active_learners_7d=len(active_user_ids),
        total_trainings=len(trainings),
        average_completion_pct=avg_completion,
        total_assignments=len(all_assignments),
        completed_assignments=len(completed_assignments),
        in_progress_assignments=len(in_progress_assignments),
        assigned_learners=total_learners,
        average_progress_pct=average_progress_pct,
        not_started_assignments=len(not_started_assignments),
        overdue_assignments=len(overdue_assignments),
        due_soon_assignments=len(due_soon_assignments),
        needs_attention_learners=len(needs_attention_user_ids),
        engagement_rate_7d_pct=engagement_rate_7d_pct,
        sessions_started_7d=len(recent_sessions),
        abandoned_sessions_7d=sum(
            1 for session in recent_sessions if session.get("status") == "abandoned"
        ),
        attention_learners=[
            AttentionLearnerAnalytics(
                user_id=p["user_id"],
                display_name=p.get("display_name"),
                avatar_url=p.get("avatar_url"),
                overdue_assignments=p["overdue_assignments"],
                not_started_assignments=p["not_started_assignments"],
            )
            for p in attention_learners[:4]
        ],
        top_performers=[LearnerAnalytics(**p) for p in top_performers[:10]],
        training_stats=[TrainingAnalytics(**s) for s in training_stats],
        bottlenecks=[],
    )


def _percentage(numerator: int, denominator: int) -> int:
    if denominator <= 0:
        return 0
    return round(numerator / denominator * 100)


def _parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str):
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _is_before(value: object, target: datetime) -> bool:
    parsed = _parse_datetime(value)
    return parsed is not None and parsed < target


def _is_between(value: object, start: datetime, end: datetime) -> bool:
    parsed = _parse_datetime(value)
    return parsed is not None and start <= parsed <= end


def _build_attention_learners(
    *,
    assignments: list[dict],
    overdue_assignments: list[dict],
    due_soon_assignments: list[dict],
    progress_by_assignment: dict[str, int],
    display_profiles: dict[str, dict],
) -> list[dict]:
    learner_ids = {
        assignment["user_id"]
        for assignment in assignments
        if assignment.get("user_id")
    }
    overdue_assignment_ids = {
        assignment["id"]
        for assignment in overdue_assignments
        if assignment.get("id")
    }
    due_soon_assignment_ids = {
        assignment["id"]
        for assignment in due_soon_assignments
        if assignment.get("id")
    }
    attention_learners: list[dict] = []

    for user_id in learner_ids:
        user_assignments = [
            assignment
            for assignment in assignments
            if assignment.get("user_id") == user_id
        ]
        open_assignments = [
            assignment
            for assignment in user_assignments
            if assignment.get("status") != "completed"
        ]
        overdue_count = sum(
            1
            for assignment in open_assignments
            if assignment.get("id") in overdue_assignment_ids
        )
        not_started_count = sum(
            1
            for assignment in open_assignments
            if assignment.get("status") == "assigned"
        )
        due_soon_count = sum(
            1
            for assignment in open_assignments
            if assignment.get("id") in due_soon_assignment_ids
        )
        if overdue_count == 0 and not_started_count == 0:
            continue

        progress_values = [
            progress_by_assignment.get(assignment["id"], 0)
            for assignment in user_assignments
            if assignment.get("id")
        ]
        average_progress_pct = (
            round(sum(progress_values) / len(progress_values))
            if progress_values
            else 0
        )
        display_profile = display_profiles.get(user_id, {})

        attention_learners.append({
            "user_id": user_id,
            "display_name": display_profile.get("display_name"),
            "avatar_url": display_profile.get("avatar_url"),
            "overdue_assignments": overdue_count,
            "not_started_assignments": not_started_count,
            "due_soon_assignments": due_soon_count,
            "open_assignments": len(open_assignments),
            "average_progress_pct": average_progress_pct,
        })

    attention_learners.sort(
        key=lambda learner: (
            learner["overdue_assignments"],
            learner["not_started_assignments"],
            learner["due_soon_assignments"],
            learner["open_assignments"],
            -learner["average_progress_pct"],
        ),
        reverse=True,
    )
    return attention_learners


def _active_user_ids_in_window(
    *,
    daily_activity_rows: list[dict],
    sessions: list[dict],
    from_date: date,
) -> set[str]:
    active_ids = {
        row["user_id"]
        for row in daily_activity_rows
        if (
            row.get("user_id")
            and date.fromisoformat(row["activity_date"]) >= from_date
            and _has_learning_activity(row)
        )
    }
    active_ids.update(
        row["user_id"]
        for row in sessions
        if row.get("user_id") and _date_from_datetime(row.get("started_at")) >= from_date
    )
    return active_ids


def _date_from_datetime(value: object) -> date:
    parsed = _parse_datetime(value)
    return parsed.date() if parsed else date.min


def _has_learning_activity(row: dict) -> bool:
    return any(
        int(row.get(field, 0) or 0) > 0
        for field in (
            "xp_earned",
            "lessons_completed",
            "steps_completed",
            "watch_seconds",
            "listen_seconds",
            "quiz_attempts",
        )
    )

"""Engagement API endpoints for session/event tracking and step attempts.

Authorization rules:
- Session creation: any authenticated user (user_id comes from JWT, not body).
- Session read/update/end: only the session owner.
- Event creation: only the session owner.
- Attempt creation: any authenticated user (user_id from JWT).
- Attempt completion/read: only the attempt owner.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.auth import CurrentUser, authorize_training_member
from app.repositories.factory import (
    build_curriculum_repository,
    build_engagement_repository,
    build_gamification_repository,
)
from app.schemas.engagement import (
    LearningEventBatchCreate,
    LearningEventCreate,
    LearningEventResponse,
    LearningSessionCreate,
    LearningSessionResponse,
    LearningSessionUpdate,
    StepAttemptComplete,
    StepAttemptCreate,
    StepAttemptResponse,
)
from app.services.engagement.commands import (
    complete_attempt,
    end_session,
    project_heartbeat_metrics,
    record_event,
    record_events_batch,
    start_attempt,
    start_session,
    update_session,
)
from app.services.engagement.queries import (
    find_active_session,
    get_attempt,
    get_session,
    list_session_events,
    list_step_attempts,
)
from app.services.curriculum.queries import (
    get_lesson_for_training,
    get_step_context_for_training,
)

router = APIRouter()


def _assert_session_owner(session_row: dict, user_id: str) -> None:
    if session_row.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="You do not own this session")


def _assert_attempt_owner(attempt_row: dict, user_id: str) -> None:
    if attempt_row.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="You do not own this attempt")


def _validate_session_scope(
    *,
    training_id: str,
    lesson_id: str | None,
    step_id: str | None,
) -> None:
    repo = build_curriculum_repository()
    if lesson_id is not None:
        get_lesson_for_training(
            repo,
            training_id=training_id,
            lesson_id=lesson_id,
        )
    if step_id is None:
        return

    step_context = get_step_context_for_training(
        repo,
        training_id=training_id,
        step_id=step_id,
    )
    if lesson_id is not None and step_context["lesson_id"] != lesson_id:
        raise HTTPException(status_code=404, detail="Step not found in this lesson")


# -- Sessions ---------------------------------------------------------------

@router.post("/sessions", response_model=LearningSessionResponse)
async def create_session(body: LearningSessionCreate, user: CurrentUser):
    access = await authorize_training_member(user, str(body.training_id))
    _validate_session_scope(
        training_id=access.training_id,
        lesson_id=str(body.lesson_id) if body.lesson_id else None,
        step_id=str(body.step_id) if body.step_id else None,
    )

    row = start_session(
        build_engagement_repository(),
        user_id=user.user_id,
        training_id=access.training_id,
        lesson_id=str(body.lesson_id) if body.lesson_id else None,
        step_id=str(body.step_id) if body.step_id else None,
    )
    return LearningSessionResponse(**row)


@router.get("/sessions/active", response_model=Optional[LearningSessionResponse])
async def get_active_session(
    user: CurrentUser,
    training_id: UUID = Query(...),
):
    access = await authorize_training_member(user, str(training_id))
    row = find_active_session(
        build_engagement_repository(),
        user_id=user.user_id,
        training_id=access.training_id,
    )
    if row is None:
        return None
    return LearningSessionResponse(**row)


@router.get("/sessions/{session_id}", response_model=LearningSessionResponse)
async def get_session_detail(session_id: UUID, user: CurrentUser):
    repo = build_engagement_repository()
    row = get_session(repo, str(session_id))
    _assert_session_owner(row, user.user_id)
    return LearningSessionResponse(**row)


@router.put("/sessions/{session_id}", response_model=LearningSessionResponse)
async def update_session_endpoint(
    session_id: UUID,
    body: LearningSessionUpdate,
    user: CurrentUser,
):
    repo = build_engagement_repository()
    existing = get_session(repo, str(session_id))
    _assert_session_owner(existing, user.user_id)
    next_lesson_id = str(body.lesson_id) if body.lesson_id else existing.get("lesson_id")
    _validate_session_scope(
        training_id=existing["training_id"],
        lesson_id=next_lesson_id,
        step_id=str(body.step_id) if body.step_id else None,
    )

    row = update_session(
        repo,
        session_id=str(session_id),
        user_id=user.user_id,
        status=body.status,
        lesson_id=str(body.lesson_id) if body.lesson_id else None,
        step_id=str(body.step_id) if body.step_id else None,
    )
    return LearningSessionResponse(**row)


@router.post("/sessions/{session_id}/end", response_model=LearningSessionResponse)
async def end_session_endpoint(session_id: UUID, user: CurrentUser):
    repo = build_engagement_repository()
    existing = get_session(repo, str(session_id))
    _assert_session_owner(existing, user.user_id)

    row = end_session(
        repo,
        session_id=str(session_id),
        user_id=user.user_id,
    )
    return LearningSessionResponse(**row)


# -- Events -----------------------------------------------------------------

@router.post("/events", response_model=LearningEventResponse)
async def create_event(body: LearningEventCreate, user: CurrentUser):
    repo = build_engagement_repository()
    session = get_session(repo, str(body.session_id))
    _assert_session_owner(session, user.user_id)
    if body.step_id:
        _validate_session_scope(
            training_id=session["training_id"],
            lesson_id=session.get("lesson_id"),
            step_id=str(body.step_id),
        )

    row = record_event(
        repo,
        session_id=str(body.session_id),
        user_id=user.user_id,
        event_type=body.event_type,
        step_id=str(body.step_id) if body.step_id else None,
        payload=body.payload,
    )

    if body.event_type == "heartbeat":
        project_heartbeat_metrics(
            build_gamification_repository(),
            user_id=user.user_id,
            payload=body.payload,
        )

    return LearningEventResponse(**row)


@router.post("/events/batch", response_model=List[LearningEventResponse])
async def create_events_batch(body: LearningEventBatchCreate, user: CurrentUser):
    repo = build_engagement_repository()

    session_by_id: dict[str, dict] = {}
    for sid in {str(event.session_id) for event in body.events}:
        session = get_session(repo, sid)
        _assert_session_owner(session, user.user_id)
        session_by_id[sid] = session

    for event in body.events:
        if event.step_id is None:
            continue
        session = session_by_id[str(event.session_id)]
        _validate_session_scope(
            training_id=session["training_id"],
            lesson_id=session.get("lesson_id"),
            step_id=str(event.step_id),
        )

    rows = record_events_batch(
        repo,
        user_id=user.user_id,
        events=[
            {
                "session_id": str(e.session_id),
                "event_type": e.event_type,
                "step_id": str(e.step_id) if e.step_id else None,
                "payload": e.payload,
            }
            for e in body.events
        ],
    )
    gamification_repo = build_gamification_repository()
    for event in body.events:
        if event.event_type != "heartbeat":
            continue
        project_heartbeat_metrics(
            gamification_repo,
            user_id=user.user_id,
            payload=event.payload,
        )
    return [LearningEventResponse(**row) for row in rows]


@router.get("/sessions/{session_id}/events", response_model=List[LearningEventResponse])
async def list_events(session_id: UUID, user: CurrentUser):
    repo = build_engagement_repository()
    session = get_session(repo, str(session_id))
    _assert_session_owner(session, user.user_id)

    rows = list_session_events(repo, str(session_id))
    return [LearningEventResponse(**row) for row in rows]


# -- Attempts ---------------------------------------------------------------

@router.post("/attempts", response_model=StepAttemptResponse)
async def create_attempt(body: StepAttemptCreate, user: CurrentUser):
    engagement_repo = build_engagement_repository()
    curriculum_repo = build_curriculum_repository()
    if body.session_id:
        session = get_session(engagement_repo, str(body.session_id))
        _assert_session_owner(session, user.user_id)
        _validate_session_scope(
            training_id=session["training_id"],
            lesson_id=session.get("lesson_id"),
            step_id=str(body.step_id),
        )
    else:
        step_context = curriculum_repo.get_step_context(str(body.step_id))
        await authorize_training_member(user, step_context["training_id"])

    row = start_attempt(
        engagement_repo,
        user_id=user.user_id,
        step_id=str(body.step_id),
        session_id=str(body.session_id) if body.session_id else None,
        answer_payload=body.answer_payload,
    )
    return StepAttemptResponse(**row)


@router.put("/attempts/{attempt_id}/complete", response_model=StepAttemptResponse)
async def complete_attempt_endpoint(
    attempt_id: UUID,
    body: StepAttemptComplete,
    user: CurrentUser,
):
    repo = build_engagement_repository()
    existing = get_attempt(repo, str(attempt_id))
    _assert_attempt_owner(existing, user.user_id)

    row = complete_attempt(
        repo,
        attempt_id=str(attempt_id),
        score=body.score,
        max_score=body.max_score,
        passed=body.passed,
        answer_payload=body.answer_payload,
    )
    return StepAttemptResponse(**row)


@router.get("/attempts/{attempt_id}", response_model=StepAttemptResponse)
async def get_attempt_detail(attempt_id: UUID, user: CurrentUser):
    repo = build_engagement_repository()
    row = get_attempt(repo, str(attempt_id))
    _assert_attempt_owner(row, user.user_id)
    return StepAttemptResponse(**row)


@router.get("/steps/{step_id}/attempts", response_model=List[StepAttemptResponse])
async def list_attempts(step_id: UUID, user: CurrentUser):
    step_context = build_curriculum_repository().get_step_context(str(step_id))
    await authorize_training_member(user, step_context["training_id"])
    rows = list_step_attempts(
        build_engagement_repository(),
        user_id=user.user_id,
        step_id=str(step_id),
    )
    return [StepAttemptResponse(**row) for row in rows]

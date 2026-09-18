from __future__ import annotations

from app.repositories.engagement_repository import EngagementRepository
from app.repositories.types import (
    LearningEventRow,
    LearningSessionRow,
    StepAttemptRow,
)


def get_session(repo: EngagementRepository, session_id: str) -> LearningSessionRow:
    return repo.get_session(session_id)


def find_active_session(
    repo: EngagementRepository,
    *,
    user_id: str,
    training_id: str,
) -> LearningSessionRow | None:
    return repo.find_active_session(user_id=user_id, training_id=training_id)


def list_session_events(
    repo: EngagementRepository,
    session_id: str,
) -> list[LearningEventRow]:
    return repo.list_events(session_id=session_id)


def get_attempt(repo: EngagementRepository, attempt_id: str) -> StepAttemptRow:
    return repo.get_attempt(attempt_id)


def list_step_attempts(
    repo: EngagementRepository,
    *,
    user_id: str,
    step_id: str,
) -> list[StepAttemptRow]:
    return repo.list_attempts(user_id=user_id, step_id=step_id)

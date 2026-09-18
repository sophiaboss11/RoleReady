from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.repositories.engagement_repository import EngagementRepository
from app.repositories.gamification_repository import GamificationRepository
from app.repositories.types import (
    LearningEventRow,
    LearningSessionRow,
    StepAttemptRow,
)

MAX_HEARTBEAT_DURATION_SECONDS = 30


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _parse_utc_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def start_session(
    repo: EngagementRepository,
    *,
    user_id: str,
    training_id: str,
    lesson_id: str | None,
    step_id: str | None,
) -> LearningSessionRow:
    existing_session = repo.find_active_session(user_id=user_id, training_id=training_id)
    if existing_session is not None:
        abandon_session(
            repo,
            session_id=existing_session["id"],
            user_id=user_id,
        )

    now = _utc_now_iso()
    row: LearningSessionRow = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "training_id": training_id,
        "lesson_id": lesson_id,
        "step_id": step_id,
        "started_at": now,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    session = repo.create_session(row)

    record_event(
        repo,
        session_id=session["id"],
        user_id=user_id,
        event_type="session_start",
        step_id=None,
        payload={},
    )

    return session


def abandon_session(
    repo: EngagementRepository,
    *,
    session_id: str,
    user_id: str,
) -> LearningSessionRow:
    now = _utc_now_iso()
    updated = repo.update_session(session_id, {
        "status": "abandoned",
        "ended_at": now,
        "updated_at": now,
    })

    record_event(
        repo,
        session_id=session_id,
        user_id=user_id,
        event_type="session_end",
        step_id=None,
        payload={"abandoned": True},
    )

    return updated


def end_session(
    repo: EngagementRepository,
    *,
    session_id: str,
    user_id: str,
) -> LearningSessionRow:
    session = repo.get_session(session_id)
    now_dt = _utc_now()
    now = now_dt.isoformat()

    duration = None
    if session.get("started_at"):
        started = _parse_utc_datetime(session["started_at"])
        duration = max(0, int((now_dt - started).total_seconds()))

    updated = repo.update_session(session_id, {
        "status": "completed",
        "ended_at": now,
        "duration_seconds": duration,
        "updated_at": now,
    })

    record_event(
        repo,
        session_id=session_id,
        user_id=user_id,
        event_type="session_end",
        step_id=None,
        payload={"duration_seconds": duration},
    )

    return updated


def update_session(
    repo: EngagementRepository,
    *,
    session_id: str,
    user_id: str,
    status: str | None,
    lesson_id: str | None,
    step_id: str | None,
) -> LearningSessionRow:
    now = _utc_now_iso()
    update_data: dict[str, object] = {"updated_at": now}

    if status is not None:
        update_data["status"] = status
        if status == "completed":
            update_data["ended_at"] = now
    if lesson_id is not None:
        update_data["lesson_id"] = lesson_id
    if step_id is not None:
        update_data["step_id"] = step_id

    return repo.update_session(session_id, update_data)


def record_event(
    repo: EngagementRepository,
    *,
    session_id: str,
    user_id: str,
    event_type: str,
    step_id: str | None,
    payload: dict,
) -> LearningEventRow:
    now = _utc_now_iso()
    row: LearningEventRow = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "user_id": user_id,
        "event_type": event_type,
        "step_id": step_id,
        "payload": payload,
        "created_at": now,
    }
    return repo.create_event(row)


def record_events_batch(
    repo: EngagementRepository,
    *,
    user_id: str,
    events: list[dict],
) -> list[LearningEventRow]:
    now = _utc_now_iso()
    rows: list[LearningEventRow] = [
        {
            "id": str(uuid.uuid4()),
            "session_id": event["session_id"],
            "user_id": user_id,
            "event_type": event["event_type"],
            "step_id": event.get("step_id"),
            "payload": event.get("payload", {}),
            "created_at": now,
        }
        for event in events
    ]
    return repo.create_events_batch(rows)


def start_attempt(
    repo: EngagementRepository,
    *,
    user_id: str,
    step_id: str,
    session_id: str | None,
    answer_payload: dict,
) -> StepAttemptRow:
    attempt_number = repo.count_attempts(user_id=user_id, step_id=step_id) + 1
    now = _utc_now_iso()
    row: StepAttemptRow = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "step_id": step_id,
        "session_id": session_id,
        "attempt_number": attempt_number,
        "answer_payload": answer_payload,
        "started_at": now,
        "created_at": now,
    }
    return repo.create_attempt(row)


def complete_attempt(
    repo: EngagementRepository,
    *,
    attempt_id: str,
    score: int | None,
    max_score: int | None,
    passed: bool | None,
    answer_payload: dict | None,
) -> StepAttemptRow:
    now = _utc_now_iso()
    update_data: dict[str, object] = {"completed_at": now}
    if score is not None:
        update_data["score"] = score
    if max_score is not None:
        update_data["max_score"] = max_score
    if passed is not None:
        update_data["passed"] = passed
    if answer_payload is not None:
        update_data["answer_payload"] = answer_payload
    return repo.update_attempt(attempt_id, update_data)


def project_heartbeat_metrics(
    repo: GamificationRepository,
    *,
    user_id: str,
    payload: dict[str, object],
) -> None:
    media_type = payload.get("media_type")
    if media_type not in {"video", "audio"}:
        return

    raw_duration = payload.get("duration_seconds", 10)
    duration_seconds = raw_duration if isinstance(raw_duration, int) else 10
    duration_seconds = max(1, min(duration_seconds, MAX_HEARTBEAT_DURATION_SECONDS))
    if duration_seconds <= 0:
        return

    if media_type == "video":
        repo.increment_profile_metrics(
            user_id=user_id,
            total_watch_seconds=duration_seconds,
        )
        repo.increment_daily_activity(
            user_id=user_id,
            activity_date=date.today().isoformat(),
            watch_seconds=duration_seconds,
        )
        return

    repo.increment_profile_metrics(
        user_id=user_id,
        total_listen_seconds=duration_seconds,
    )
    repo.increment_daily_activity(
        user_id=user_id,
        activity_date=date.today().isoformat(),
        listen_seconds=duration_seconds,
    )

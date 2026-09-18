"""Learning completion orchestration.

Completion side effects must run exactly once per entity transition.
This module centralizes those transitions so endpoints remain thin and
future learning features can attach to the same completion pipeline.
"""

from __future__ import annotations

from datetime import date

from app.core.exceptions import InfraError
from app.repositories.curriculum_repository import CurriculumRepository
from app.repositories.gamification_repository import GamificationRepository
from app.repositories.progress_repository import ProgressRepository
from app.repositories.types import (
    LearnerLessonProgressRow,
    LearnerStepProgressRow,
    LearnerTrainingProgressRow,
)
from app.services.curriculum.queries import get_step_context_for_training
from app.services.gamification.xp_engine import (
    grant_xp_for_lesson_complete,
    grant_xp_for_quiz,
    grant_xp_for_step_complete,
    grant_xp_for_training_complete,
    recalculate_streak,
)

COMPLETED_LESSON_STATUSES = frozenset({"completed", "mastered"})
COMPLETED_TRAINING_STATUSES = frozenset({"completed"})


def on_step_completed(
    progress_repo: ProgressRepository,
    curriculum_repo: CurriculumRepository,
    gamification_repo: GamificationRepository,
    *,
    user_id: str,
    training_id: str,
    step_id: str,
    score: int | None = None,
    max_score: int | None = None,
) -> None:
    """Project a step completion and apply transition-based side effects once."""
    step_context = get_step_context_for_training(
        curriculum_repo,
        training_id=training_id,
        step_id=step_id,
    )

    progress_repo.project_step_completion(
        user_id=user_id,
        step_id=step_id,
        score=score,
        max_score=max_score,
    )

    step_progress = progress_repo.get_step_progress(user_id=user_id, step_id=step_id)
    lesson_progress = progress_repo.get_lesson_progress(
        user_id=user_id,
        lesson_id=step_context["lesson_id"],
    )
    training_progress = progress_repo.get_training_progress(
        user_id=user_id,
        training_id=training_id,
    )
    if step_progress is None or lesson_progress is None or training_progress is None:
        raise InfraError("Step completion projection did not materialize expected progress rows")

    completion_recorded = False
    if _was_just_completed(step_progress, {"completed"}):
        _record_step_completion(
            gamification_repo,
            user_id=user_id,
            step_id=step_id,
            training_id=training_id,
            is_scorable=step_context.get("is_scorable", False),
            score=score,
            max_score=max_score,
        )
        completion_recorded = True

    if _was_just_completed(lesson_progress, COMPLETED_LESSON_STATUSES):
        on_lesson_completed(
            gamification_repo,
            user_id=user_id,
            lesson_id=step_context["lesson_id"],
            training_id=training_id,
        )
        completion_recorded = True

    if _was_just_completed(training_progress, COMPLETED_TRAINING_STATUSES):
        on_training_completed(
            gamification_repo,
            user_id=user_id,
            training_id=training_id,
        )
        completion_recorded = True

    if completion_recorded:
        recalculate_streak(gamification_repo, user_id)


def on_lesson_completed(
    gamification_repo: GamificationRepository,
    *,
    user_id: str,
    lesson_id: str,
    training_id: str,
) -> None:
    """Reward a lesson completion transition exactly once."""
    grant_xp_for_lesson_complete(
        gamification_repo,
        user_id=user_id,
        lesson_id=lesson_id,
        training_id=training_id,
    )
    gamification_repo.increment_profile_metrics(
        user_id=user_id,
        total_lessons_completed=1,
    )
    gamification_repo.increment_daily_activity(
        user_id=user_id,
        activity_date=date.today().isoformat(),
        lessons_completed=1,
    )


def on_training_completed(
    gamification_repo: GamificationRepository,
    *,
    user_id: str,
    training_id: str,
) -> None:
    """Reward a training completion transition exactly once."""
    grant_xp_for_training_complete(
        gamification_repo,
        user_id=user_id,
        training_id=training_id,
    )


def on_module_completed(
    gamification_repo: GamificationRepository,
    *,
    user_id: str,
    module_id: str,
    training_id: str,
    training_completed: bool = False,
    score: int | None = None,
    max_score: int | None = None,
) -> None:
    """Bridge the legacy module model into the same completion pipeline."""
    grant_xp_for_step_complete(
        gamification_repo,
        user_id=user_id,
        step_id=module_id,
        training_id=training_id,
    )
    grant_xp_for_lesson_complete(
        gamification_repo,
        user_id=user_id,
        lesson_id=module_id,
        training_id=training_id,
    )
    if score is not None and max_score is not None and max_score > 0:
        grant_xp_for_quiz(
            gamification_repo,
            user_id=user_id,
            step_id=module_id,
            score=score,
            max_score=max_score,
            training_id=training_id,
        )

    gamification_repo.increment_profile_metrics(
        user_id=user_id,
        total_lessons_completed=1,
        total_steps_completed=1,
        quiz_total_score=score if score is not None and max_score is not None else 0,
        quiz_total_max_score=max_score if max_score is not None and score is not None else 0,
    )
    gamification_repo.increment_daily_activity(
        user_id=user_id,
        activity_date=date.today().isoformat(),
        lessons_completed=1,
        steps_completed=1,
        quiz_attempts=1 if score is not None and max_score is not None else 0,
    )

    if training_completed:
        on_training_completed(
            gamification_repo,
            user_id=user_id,
            training_id=training_id,
        )

    recalculate_streak(gamification_repo, user_id)


def _record_step_completion(
    repo: GamificationRepository,
    *,
    user_id: str,
    step_id: str,
    training_id: str,
    is_scorable: bool,
    score: int | None,
    max_score: int | None,
) -> None:
    grant_xp_for_step_complete(
        repo,
        user_id=user_id,
        step_id=step_id,
        training_id=training_id,
    )

    quiz_attempted = is_scorable and score is not None and max_score is not None
    if quiz_attempted and score is not None and max_score is not None:
        grant_xp_for_quiz(
            repo,
            user_id=user_id,
            step_id=step_id,
            score=score,
            max_score=max_score,
            training_id=training_id,
        )

    repo.increment_profile_metrics(
        user_id=user_id,
        total_steps_completed=1,
        quiz_total_score=score if quiz_attempted and score is not None else 0,
        quiz_total_max_score=max_score if quiz_attempted and max_score is not None else 0,
    )
    repo.increment_daily_activity(
        user_id=user_id,
        activity_date=date.today().isoformat(),
        steps_completed=1,
        quiz_attempts=1 if quiz_attempted else 0,
    )


def _was_just_completed(
    row: LearnerStepProgressRow | LearnerLessonProgressRow | LearnerTrainingProgressRow,
    completed_statuses: set[str] | frozenset[str],
) -> bool:
    completed_at = row.get("completed_at")
    updated_at = row.get("updated_at")
    return (
        row.get("status") in completed_statuses
        and completed_at is not None
        and updated_at is not None
        and completed_at == updated_at
    )

"""Progress API endpoints for learner progress snapshots.

Authorization rules:
- Learner progress: scoped to viewer via TrainingMemberAccess.
- Step completion: triggers the full gamification pipeline.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.auth import TrainingMemberAccess
from app.repositories.factory import (
    build_curriculum_repository,
    build_gamification_repository,
    build_progress_repository,
)
from app.schemas.progress import (
    LearnerLessonProgressResponse,
    LearnerPathOverviewResponse,
    LearnerStepProgressResponse,
)
from app.services.learning_completion import on_step_completed
from app.services.curriculum.queries import (
    get_lesson_for_training,
    get_step_for_training,
)
from app.services.progress.queries import get_learner_path_overview


class StepCompleteRequest(BaseModel):
    score: Optional[int] = Field(None, ge=0, description="Quiz score (if scorable step)")
    max_score: Optional[int] = Field(None, ge=0, description="Quiz max score (if scorable step)")

router = APIRouter()


@router.get(
    "/{training_id}/learner-progress",
    response_model=LearnerPathOverviewResponse,
)
async def get_path_overview(access: TrainingMemberAccess):
    data = get_learner_path_overview(
        build_progress_repository(),
        build_curriculum_repository(),
        user_id=access.user_id,
        training_id=access.training_id,
    )
    return LearnerPathOverviewResponse(**data)


@router.get(
    "/{training_id}/learner-progress/lessons",
    response_model=List[LearnerLessonProgressResponse],
)
async def list_lesson_progress(access: TrainingMemberAccess):
    repo = build_progress_repository()
    rows = repo.list_lesson_progress(
        user_id=access.user_id,
        training_id=access.training_id,
    )
    return [LearnerLessonProgressResponse(**row) for row in rows]


@router.get(
    "/{training_id}/learner-progress/lessons/{lesson_id}/steps",
    response_model=List[LearnerStepProgressResponse],
)
async def list_step_progress(lesson_id: UUID, access: TrainingMemberAccess):
    get_lesson_for_training(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
    )
    repo = build_progress_repository()
    rows = repo.list_step_progress(
        user_id=access.user_id,
        lesson_id=str(lesson_id),
    )
    return [LearnerStepProgressResponse(**row) for row in rows]


@router.post("/{training_id}/steps/{step_id}/complete")
async def mark_step_complete(
    step_id: UUID,
    access: TrainingMemberAccess,
    body: Optional[StepCompleteRequest] = None,
):
    """Complete a step and trigger the full gamification pipeline:
    progress projection → XP grant → profile update → streak → escalation.

    For scorable steps (quizzes), pass score/max_score in the request body
    to trigger quiz XP and update accuracy metrics.
    """
    score = body.score if body else None
    max_score = body.max_score if body else None
    curriculum_repo = build_curriculum_repository()
    get_step_for_training(
        curriculum_repo,
        training_id=access.training_id,
        step_id=str(step_id),
    )

    on_step_completed(
        build_progress_repository(),
        curriculum_repo,
        build_gamification_repository(),
        user_id=access.user_id,
        training_id=access.training_id,
        step_id=str(step_id),
        score=score,
        max_score=max_score,
    )
    return {"message": "Step completed successfully"}

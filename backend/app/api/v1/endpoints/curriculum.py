"""Curriculum API endpoints for lesson/step hierarchy."""

from typing import List
from uuid import UUID

from fastapi import APIRouter

from app.core.auth import TrainingAdminAccess, TrainingMemberAccess
from app.repositories.factory import build_curriculum_repository
from app.schemas.curriculum import (
    CurriculumOverviewResponse,
    LessonDependencyCreate,
    LessonDependencyResponse,
    LessonStepCreate,
    LessonStepResponse,
    LessonStepUpdate,
    LessonWithStepsResponse,
    TrainingLessonCreate,
    TrainingLessonResponse,
    TrainingLessonUpdate,
)
from app.services.curriculum.commands import (
    create_dependency,
    create_lesson,
    create_step,
    delete_dependency,
    delete_lesson,
    delete_step,
    update_lesson,
    update_step,
)
from app.services.curriculum.queries import (
    get_curriculum_overview,
    get_dependency_for_training,
    get_lesson_for_training,
    list_lessons,
    list_steps,
    get_step_for_lesson,
)

router = APIRouter()


@router.get("/{training_id}/curriculum", response_model=CurriculumOverviewResponse)
async def get_curriculum(access: TrainingMemberAccess):
    data = get_curriculum_overview(
        build_curriculum_repository(),
        training_id=access.training_id,
    )
    return CurriculumOverviewResponse(**data)


@router.get("/{training_id}/lessons", response_model=List[TrainingLessonResponse])
async def list_training_lessons(access: TrainingMemberAccess):
    rows = list_lessons(build_curriculum_repository(), access.training_id)
    return [TrainingLessonResponse(**row) for row in rows]


@router.post("/{training_id}/lessons", response_model=TrainingLessonResponse)
async def create_training_lesson(body: TrainingLessonCreate, access: TrainingAdminAccess):
    row = create_lesson(
        build_curriculum_repository(),
        training_id=access.training_id,
        title=body.title,
        description=body.description,
        sort_order=body.sort_order,
        is_required=body.is_required,
        unlock_rule=body.unlock_rule,
        estimated_duration_minutes=body.estimated_duration_minutes,
    )
    return TrainingLessonResponse(**row)


@router.put("/{training_id}/lessons/{lesson_id}", response_model=TrainingLessonResponse)
async def update_training_lesson(
    lesson_id: UUID,
    body: TrainingLessonUpdate,
    access: TrainingAdminAccess,
):
    get_lesson_for_training(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
    )
    row = update_lesson(
        build_curriculum_repository(),
        lesson_id=str(lesson_id),
        title=body.title,
        description=body.description,
        sort_order=body.sort_order,
        is_required=body.is_required,
        unlock_rule=body.unlock_rule,
        estimated_duration_minutes=body.estimated_duration_minutes,
    )
    return TrainingLessonResponse(**row)


@router.delete("/{training_id}/lessons/{lesson_id}")
async def delete_training_lesson(lesson_id: UUID, access: TrainingAdminAccess):
    get_lesson_for_training(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
    )
    delete_lesson(build_curriculum_repository(), str(lesson_id))
    return {"message": "Lesson deleted successfully"}


@router.get("/{training_id}/lessons/{lesson_id}/steps", response_model=List[LessonStepResponse])
async def list_lesson_steps(lesson_id: UUID, access: TrainingMemberAccess):
    get_lesson_for_training(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
    )
    rows = list_steps(build_curriculum_repository(), str(lesson_id))
    return [LessonStepResponse(**row) for row in rows]


@router.post("/{training_id}/lessons/{lesson_id}/steps", response_model=LessonStepResponse)
async def create_lesson_step(
    lesson_id: UUID,
    body: LessonStepCreate,
    access: TrainingAdminAccess,
):
    get_lesson_for_training(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
    )
    row = create_step(
        build_curriculum_repository(),
        lesson_id=str(lesson_id),
        title=body.title,
        description=body.description,
        step_type=body.step_type,
        sort_order=body.sort_order,
        content_url=body.content_url,
        content_body=body.content_body,
        is_required=body.is_required,
        is_scorable=body.is_scorable,
        max_score=body.max_score,
        pass_threshold=body.pass_threshold,
        estimated_duration_minutes=body.estimated_duration_minutes,
    )
    return LessonStepResponse(**row)


@router.put(
    "/{training_id}/lessons/{lesson_id}/steps/{step_id}",
    response_model=LessonStepResponse,
)
async def update_lesson_step(
    lesson_id: UUID,
    step_id: UUID,
    body: LessonStepUpdate,
    access: TrainingAdminAccess,
):
    get_step_for_lesson(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
        step_id=str(step_id),
    )
    row = update_step(
        build_curriculum_repository(),
        step_id=str(step_id),
        title=body.title,
        description=body.description,
        step_type=body.step_type,
        sort_order=body.sort_order,
        content_url=body.content_url,
        content_body=body.content_body,
        is_required=body.is_required,
        is_scorable=body.is_scorable,
        max_score=body.max_score,
        pass_threshold=body.pass_threshold,
        estimated_duration_minutes=body.estimated_duration_minutes,
    )
    return LessonStepResponse(**row)


@router.delete("/{training_id}/lessons/{lesson_id}/steps/{step_id}")
async def delete_lesson_step(lesson_id: UUID, step_id: UUID, access: TrainingAdminAccess):
    get_step_for_lesson(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
        step_id=str(step_id),
    )
    delete_step(build_curriculum_repository(), str(step_id))
    return {"message": "Step deleted successfully"}


@router.post(
    "/{training_id}/lessons/{lesson_id}/dependencies",
    response_model=LessonDependencyResponse,
)
async def create_lesson_dependency(
    lesson_id: UUID,
    body: LessonDependencyCreate,
    access: TrainingAdminAccess,
):
    repo = build_curriculum_repository()
    get_lesson_for_training(
        repo,
        training_id=access.training_id,
        lesson_id=str(lesson_id),
    )
    get_lesson_for_training(
        repo,
        training_id=access.training_id,
        lesson_id=str(body.prerequisite_id),
    )
    row = create_dependency(
        repo,
        lesson_id=str(lesson_id),
        prerequisite_id=str(body.prerequisite_id),
    )
    return LessonDependencyResponse(**row)


@router.delete("/{training_id}/lessons/{lesson_id}/dependencies/{dependency_id}")
async def delete_lesson_dependency(lesson_id: UUID, dependency_id: UUID, access: TrainingAdminAccess):
    get_lesson_for_training(
        build_curriculum_repository(),
        training_id=access.training_id,
        lesson_id=str(lesson_id),
    )
    get_dependency_for_training(
        build_curriculum_repository(),
        training_id=access.training_id,
        dependency_id=str(dependency_id),
    )
    delete_dependency(build_curriculum_repository(), str(dependency_id))
    return {"message": "Dependency deleted successfully"}

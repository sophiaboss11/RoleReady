from __future__ import annotations

import uuid
from datetime import datetime

from app.core.exceptions import ValidationError
from app.repositories.curriculum_repository import CurriculumRepository
from app.repositories.types import (
    LessonDependencyRow,
    LessonStepRow,
    TrainingLessonRow,
)


def create_lesson(
    repo: CurriculumRepository,
    *,
    training_id: str,
    title: str,
    description: str | None,
    sort_order: int,
    is_required: bool,
    unlock_rule: str,
    estimated_duration_minutes: int | None,
) -> TrainingLessonRow:
    now = datetime.utcnow().isoformat()
    row: TrainingLessonRow = {
        "id": str(uuid.uuid4()),
        "training_id": training_id,
        "title": title,
        "description": description,
        "sort_order": sort_order,
        "is_required": is_required,
        "unlock_rule": unlock_rule,
        "estimated_duration_minutes": estimated_duration_minutes,
        "created_at": now,
        "updated_at": now,
    }
    return repo.create_lesson(row)


def update_lesson(
    repo: CurriculumRepository,
    *,
    lesson_id: str,
    title: str | None,
    description: str | None,
    sort_order: int | None,
    is_required: bool | None,
    unlock_rule: str | None,
    estimated_duration_minutes: int | None,
) -> TrainingLessonRow:
    update_data: dict[str, object] = {}
    for key, value in {
        "title": title,
        "description": description,
        "sort_order": sort_order,
        "is_required": is_required,
        "unlock_rule": unlock_rule,
        "estimated_duration_minutes": estimated_duration_minutes,
    }.items():
        if value is not None:
            update_data[key] = value

    if not update_data:
        raise ValidationError("No updatable fields provided")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    return repo.update_lesson(lesson_id, update_data)


def delete_lesson(repo: CurriculumRepository, lesson_id: str) -> None:
    repo.delete_lesson(lesson_id)


def create_step(
    repo: CurriculumRepository,
    *,
    lesson_id: str,
    title: str,
    description: str | None,
    step_type: str,
    sort_order: int,
    content_url: str | None,
    content_body: str | None,
    is_required: bool,
    is_scorable: bool,
    max_score: int | None,
    pass_threshold: int | None,
    estimated_duration_minutes: int | None,
) -> LessonStepRow:
    now = datetime.utcnow().isoformat()
    row: LessonStepRow = {
        "id": str(uuid.uuid4()),
        "lesson_id": lesson_id,
        "title": title,
        "description": description,
        "step_type": step_type,
        "sort_order": sort_order,
        "content_url": content_url,
        "content_body": content_body,
        "is_required": is_required,
        "is_scorable": is_scorable,
        "max_score": max_score,
        "pass_threshold": pass_threshold,
        "estimated_duration_minutes": estimated_duration_minutes,
        "created_at": now,
        "updated_at": now,
    }
    return repo.create_step(row)


def update_step(
    repo: CurriculumRepository,
    *,
    step_id: str,
    title: str | None,
    description: str | None,
    step_type: str | None,
    sort_order: int | None,
    content_url: str | None,
    content_body: str | None,
    is_required: bool | None,
    is_scorable: bool | None,
    max_score: int | None,
    pass_threshold: int | None,
    estimated_duration_minutes: int | None,
) -> LessonStepRow:
    update_data: dict[str, object] = {}
    for key, value in {
        "title": title,
        "description": description,
        "step_type": step_type,
        "sort_order": sort_order,
        "content_url": content_url,
        "content_body": content_body,
        "is_required": is_required,
        "is_scorable": is_scorable,
        "max_score": max_score,
        "pass_threshold": pass_threshold,
        "estimated_duration_minutes": estimated_duration_minutes,
    }.items():
        if value is not None:
            update_data[key] = value

    if not update_data:
        raise ValidationError("No updatable fields provided")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    return repo.update_step(step_id, update_data)


def delete_step(repo: CurriculumRepository, step_id: str) -> None:
    repo.delete_step(step_id)


def create_dependency(
    repo: CurriculumRepository,
    *,
    lesson_id: str,
    prerequisite_id: str,
) -> LessonDependencyRow:
    if lesson_id == prerequisite_id:
        raise ValidationError("A lesson cannot depend on itself")

    row: LessonDependencyRow = {
        "id": str(uuid.uuid4()),
        "lesson_id": lesson_id,
        "prerequisite_id": prerequisite_id,
    }
    return repo.create_dependency(row)


def delete_dependency(repo: CurriculumRepository, dependency_id: str) -> None:
    repo.delete_dependency(dependency_id)

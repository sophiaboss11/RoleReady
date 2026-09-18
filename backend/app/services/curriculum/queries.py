from __future__ import annotations

from collections import defaultdict
from typing import TypedDict

from app.core.exceptions import NotFoundError
from app.repositories.curriculum_repository import CurriculumRepository
from app.repositories.types import (
    LessonDependencyRow,
    LessonStepContextRow,
    LessonStepRow,
    TrainingLessonRow,
)


class StepInTraining(TypedDict):
    step: LessonStepRow
    lesson: TrainingLessonRow


def list_lessons(repo: CurriculumRepository, training_id: str) -> list[TrainingLessonRow]:
    return repo.list_lessons([training_id])


def get_lesson(repo: CurriculumRepository, lesson_id: str) -> TrainingLessonRow:
    return repo.get_lesson(lesson_id)


def get_lesson_for_training(
    repo: CurriculumRepository,
    *,
    training_id: str,
    lesson_id: str,
) -> TrainingLessonRow:
    lesson = repo.get_lesson(lesson_id)
    if lesson["training_id"] != training_id:
        raise NotFoundError("Lesson not found in this training")
    return lesson


def get_step_for_training(
    repo: CurriculumRepository,
    *,
    training_id: str,
    step_id: str,
) -> StepInTraining:
    step = repo.get_step(step_id)
    lesson = get_lesson_for_training(
        repo,
        training_id=training_id,
        lesson_id=step["lesson_id"],
    )
    return {"step": step, "lesson": lesson}


def get_step_for_lesson(
    repo: CurriculumRepository,
    *,
    training_id: str,
    lesson_id: str,
    step_id: str,
) -> StepInTraining:
    lesson = get_lesson_for_training(repo, training_id=training_id, lesson_id=lesson_id)
    step = repo.get_step(step_id)
    if step["lesson_id"] != lesson_id:
        raise NotFoundError("Step not found in this lesson")
    return {"step": step, "lesson": lesson}


def get_dependency_for_training(
    repo: CurriculumRepository,
    *,
    training_id: str,
    dependency_id: str,
) -> LessonDependencyRow:
    dependency = repo.get_dependency(dependency_id)
    get_lesson_for_training(
        repo,
        training_id=training_id,
        lesson_id=dependency["lesson_id"],
    )
    return dependency


def get_step_context_for_training(
    repo: CurriculumRepository,
    *,
    training_id: str,
    step_id: str,
) -> LessonStepContextRow:
    context = repo.get_step_context(step_id)
    if context["training_id"] != training_id:
        raise NotFoundError("Step not found in this training")
    return context


def get_curriculum_overview(
    repo: CurriculumRepository,
    training_id: str,
) -> dict:
    lessons = repo.list_lessons([training_id])
    if not lessons:
        return {"training_id": training_id, "lessons": []}

    lesson_ids = [lesson["id"] for lesson in lessons]
    steps = repo.list_steps(lesson_ids)
    dependencies = repo.list_dependencies(lesson_ids)

    steps_by_lesson = _group_steps_by_lesson_id(steps)
    deps_by_lesson = _group_deps_by_lesson_id(dependencies)

    return {
        "training_id": training_id,
        "lessons": [
            {
                **lesson,
                "steps": steps_by_lesson.get(lesson["id"], []),
                "prerequisites": [
                    dep["prerequisite_id"]
                    for dep in deps_by_lesson.get(lesson["id"], [])
                ],
            }
            for lesson in lessons
        ],
    }


def list_steps(repo: CurriculumRepository, lesson_id: str) -> list[LessonStepRow]:
    return repo.list_steps([lesson_id])


def _group_steps_by_lesson_id(
    steps: list[LessonStepRow],
) -> dict[str, list[LessonStepRow]]:
    grouped: dict[str, list[LessonStepRow]] = defaultdict(list)
    for step in steps:
        grouped[step["lesson_id"]].append(step)
    return grouped


def _group_deps_by_lesson_id(
    deps: list[LessonDependencyRow],
) -> dict[str, list[LessonDependencyRow]]:
    grouped: dict[str, list[LessonDependencyRow]] = defaultdict(list)
    for dep in deps:
        grouped[dep["lesson_id"]].append(dep)
    return grouped

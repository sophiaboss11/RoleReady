from __future__ import annotations

from typing import Any

from app.repositories.curriculum_repository import CurriculumRepository
from app.repositories.progress_repository import ProgressRepository
from app.repositories.types import (
    LessonDependencyRow,
    LessonStepRow,
    TrainingLessonRow,
)


def get_learner_path_overview(
    progress_repo: ProgressRepository,
    curriculum_repo: CurriculumRepository,
    *,
    user_id: str,
    training_id: str,
) -> dict[str, Any]:
    lessons = curriculum_repo.list_lessons([training_id])
    lesson_ids = [lesson["id"] for lesson in lessons]
    steps = curriculum_repo.list_steps(lesson_ids)
    required_lessons = [lesson for lesson in lessons if lesson.get("is_required", False)]

    training_progress = progress_repo.get_training_progress(
        user_id=user_id,
        training_id=training_id,
    )

    if training_progress is None:
        training_progress = {
            "user_id": user_id,
            "training_id": training_id,
            "status": "not_started",
            "progress_pct": 0,
            "completed_lessons": 0,
            "total_lessons": len(required_lessons),
            "started_at": None,
            "completed_at": None,
            "last_active_at": None,
            "updated_at": None,
        }

    lesson_progress = progress_repo.list_lesson_progress(
        user_id=user_id,
        training_id=training_id,
    )

    deps = curriculum_repo.list_dependencies(lesson_ids)

    lesson_progress_with_unlock = compute_unlock_states(
        user_id=user_id,
        lessons=lessons,
        steps=steps,
        lesson_progress=lesson_progress,
        dependencies=deps,
    )

    return {
        "training_progress": training_progress,
        "lesson_progress": lesson_progress_with_unlock,
    }


def compute_unlock_states(
    *,
    user_id: str,
    lessons: list[TrainingLessonRow],
    steps: list[LessonStepRow],
    lesson_progress: list[dict[str, Any]],
    dependencies: list[LessonDependencyRow],
) -> list[dict[str, Any]]:
    """Determine lock/unlock state for each lesson based on prerequisites."""
    progress_by_lesson_id = {lp["lesson_id"]: lp for lp in lesson_progress}
    deps_by_lesson_id: dict[str, list[str]] = {}
    total_steps_by_lesson_id = _count_required_steps_by_lesson(steps)
    for dep in dependencies:
        deps_by_lesson_id.setdefault(dep["lesson_id"], []).append(dep["prerequisite_id"])

    completed_lesson_ids = {
        lp["lesson_id"]
        for lp in lesson_progress
        if lp["status"] in ("completed", "mastered")
    }

    sorted_lessons = sorted(lessons, key=lambda l: l["sort_order"])
    result: list[dict[str, Any]] = []

    for i, lesson in enumerate(sorted_lessons):
        lesson_id = lesson["id"]
        existing = progress_by_lesson_id.get(lesson_id)
        unlock_rule = lesson.get("unlock_rule", "sequential")

        if existing and existing["status"] in ("in_progress", "completed", "mastered"):
            result.append(existing)
            continue

        is_unlocked = _is_lesson_unlocked(
            lesson_id=lesson_id,
            lesson_index=i,
            unlock_rule=unlock_rule,
            sorted_lessons=sorted_lessons,
            completed_lesson_ids=completed_lesson_ids,
            deps_by_lesson_id=deps_by_lesson_id,
        )

        if existing:
            updated = {**existing}
            if is_unlocked and updated["status"] == "locked":
                updated["status"] = "available"
            elif not is_unlocked and updated["status"] == "available":
                updated["status"] = "locked"
            updated["total_steps"] = total_steps_by_lesson_id.get(lesson_id, updated.get("total_steps", 0))
            updated["user_id"] = updated.get("user_id") or user_id
            result.append(updated)
        else:
            result.append({
                "user_id": user_id,
                "lesson_id": lesson_id,
                "training_id": lesson["training_id"],
                "status": "available" if is_unlocked else "locked",
                "progress_pct": 0,
                "completed_steps": 0,
                "total_steps": total_steps_by_lesson_id.get(lesson_id, 0),
                "best_score": None,
                "started_at": None,
                "completed_at": None,
                "updated_at": None,
            })

    return result


def _is_lesson_unlocked(
    *,
    lesson_id: str,
    lesson_index: int,
    unlock_rule: str,
    sorted_lessons: list[dict[str, Any]],
    completed_lesson_ids: set[str],
    deps_by_lesson_id: dict[str, list[str]],
) -> bool:
    if unlock_rule == "always_open":
        return True

    if unlock_rule == "manual":
        return False

    # sequential: check explicit dependencies or previous lesson
    explicit_deps = deps_by_lesson_id.get(lesson_id, [])
    if explicit_deps:
        return all(dep_id in completed_lesson_ids for dep_id in explicit_deps)

    # No explicit deps: first lesson is always available, others need previous completed
    if lesson_index == 0:
        return True
    prev_lesson_id = sorted_lessons[lesson_index - 1]["id"]
    return prev_lesson_id in completed_lesson_ids


def _count_required_steps_by_lesson(
    steps: list[LessonStepRow],
) -> dict[str, int]:
    counts: dict[str, int] = {}
    for step in steps:
        if not step.get("is_required", False):
            continue
        lesson_id = step["lesson_id"]
        counts[lesson_id] = counts.get(lesson_id, 0) + 1
    return counts

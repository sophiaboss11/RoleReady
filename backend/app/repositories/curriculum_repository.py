from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import InfraError, NotFoundError
from app.repositories.types import (
    LessonDependencyRow,
    LessonStepContextRow,
    LessonStepRow,
    TrainingLessonRow,
)


class CurriculumRepository:
    def __init__(self, client: Client):
        self.client = client

    # -- Training Lesson ---------------------------------------------------

    def create_lesson(self, row: TrainingLessonRow) -> TrainingLessonRow:
        try:
            response = self.client.schema("RoleReady").table("training_lesson").insert(row).execute()
        except Exception as exc:
            raise InfraError(f"Failed to create lesson: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create lesson")
        return response.data[0]

    def update_lesson(self, lesson_id: str, update_data: dict[str, Any]) -> TrainingLessonRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_lesson")
                .update(update_data)
                .eq("id", lesson_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update lesson: {exc}") from exc
        if not response.data:
            raise NotFoundError("Lesson not found")
        return response.data[0]

    def delete_lesson(self, lesson_id: str) -> None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_lesson")
                .delete()
                .eq("id", lesson_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete lesson: {exc}") from exc
        if not response.data:
            raise NotFoundError("Lesson not found")

    def get_lesson(self, lesson_id: str) -> TrainingLessonRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_lesson")
                .select("*")
                .eq("id", lesson_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch lesson: {exc}") from exc
        if not response.data:
            raise NotFoundError("Lesson not found")
        return response.data[0]

    def list_lessons(self, training_ids: list[str]) -> list[TrainingLessonRow]:
        if not training_ids:
            return []
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_lesson")
                .select("*")
                .in_("training_id", training_ids)
                .order("sort_order")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list lessons: {exc}") from exc
        return response.data or []

    # -- Lesson Step -------------------------------------------------------

    def create_step(self, row: LessonStepRow) -> LessonStepRow:
        try:
            response = self.client.schema("RoleReady").table("lesson_step").insert(row).execute()
        except Exception as exc:
            raise InfraError(f"Failed to create step: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create step")
        return response.data[0]

    def update_step(self, step_id: str, update_data: dict[str, Any]) -> LessonStepRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_step")
                .update(update_data)
                .eq("id", step_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update step: {exc}") from exc
        if not response.data:
            raise NotFoundError("Step not found")
        return response.data[0]

    def delete_step(self, step_id: str) -> None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_step")
                .delete()
                .eq("id", step_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete step: {exc}") from exc
        if not response.data:
            raise NotFoundError("Step not found")

    def list_steps(self, lesson_ids: list[str]) -> list[LessonStepRow]:
        if not lesson_ids:
            return []
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_step")
                .select("*")
                .in_("lesson_id", lesson_ids)
                .order("sort_order")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list steps: {exc}") from exc
        return response.data or []

    def get_step(self, step_id: str) -> LessonStepRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_step")
                .select("*")
                .eq("id", step_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch step: {exc}") from exc
        if not response.data:
            raise NotFoundError("Step not found")
        return response.data[0]

    def get_step_context(self, step_id: str) -> LessonStepContextRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_step")
                .select(
                    "id, lesson_id, step_type, is_required, is_scorable, "
                    "lesson:lesson_id!inner(training_id)"
                )
                .eq("id", step_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch step context: {exc}") from exc
        if not response.data:
            raise NotFoundError("Step not found")

        row = response.data[0]
        lesson = row.get("lesson")
        if not isinstance(lesson, dict) or "training_id" not in lesson:
            raise InfraError("Step context is missing training_id")
        return {
            "id": row["id"],
            "lesson_id": row["lesson_id"],
            "training_id": lesson["training_id"],
            "step_type": row["step_type"],
            "is_required": row.get("is_required", False),
            "is_scorable": row.get("is_scorable", False),
        }

    # -- Lesson Dependency --------------------------------------------------

    def create_dependency(self, row: LessonDependencyRow) -> LessonDependencyRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_dependency")
                .insert(row)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to create dependency: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create dependency")
        return response.data[0]

    def delete_dependency(self, dependency_id: str) -> None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_dependency")
                .delete()
                .eq("id", dependency_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete dependency: {exc}") from exc
        if not response.data:
            raise NotFoundError("Dependency not found")

    def get_dependency(self, dependency_id: str) -> LessonDependencyRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_dependency")
                .select("*")
                .eq("id", dependency_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch dependency: {exc}") from exc
        if not response.data:
            raise NotFoundError("Dependency not found")
        return response.data[0]

    def list_dependencies(self, lesson_ids: list[str]) -> list[LessonDependencyRow]:
        if not lesson_ids:
            return []
        try:
            response = (
                self.client.schema("RoleReady")
                .table("lesson_dependency")
                .select("*")
                .in_("lesson_id", lesson_ids)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list dependencies: {exc}") from exc
        return response.data or []

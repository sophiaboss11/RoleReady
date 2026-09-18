from __future__ import annotations

from supabase import Client

from app.core.exceptions import InfraError
from app.repositories.types import (
    LearnerLessonProgressRow,
    LearnerStepProgressRow,
    LearnerTrainingProgressRow,
)


class ProgressRepository:
    def __init__(self, client: Client):
        self.client = client

    def get_training_progress(
        self,
        *,
        user_id: str,
        training_id: str,
    ) -> LearnerTrainingProgressRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_training_progress")
                .select("*")
                .eq("user_id", user_id)
                .eq("training_id", training_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch training progress: {exc}") from exc
        return response.data[0] if response.data else None

    def list_training_progress(
        self,
        *,
        user_id: str,
        training_ids: list[str] | None = None,
    ) -> list[LearnerTrainingProgressRow]:
        try:
            query = (
                self.client.schema("RoleReady")
                .table("learner_training_progress")
                .select("*")
                .eq("user_id", user_id)
            )
            if training_ids:
                query = query.in_("training_id", training_ids)
            response = query.execute()
        except Exception as exc:
            raise InfraError(f"Failed to list training progress: {exc}") from exc
        return response.data or []

    def list_lesson_progress(
        self,
        *,
        user_id: str,
        training_id: str,
    ) -> list[LearnerLessonProgressRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_lesson_progress")
                .select("*")
                .eq("user_id", user_id)
                .eq("training_id", training_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list lesson progress: {exc}") from exc
        return response.data or []

    def list_step_progress(
        self,
        *,
        user_id: str,
        lesson_id: str,
    ) -> list[LearnerStepProgressRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_step_progress")
                .select("*")
                .eq("user_id", user_id)
                .eq("lesson_id", lesson_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list step progress: {exc}") from exc
        return response.data or []

    def get_lesson_progress(
        self,
        *,
        user_id: str,
        lesson_id: str,
    ) -> LearnerLessonProgressRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_lesson_progress")
                .select("*")
                .eq("user_id", user_id)
                .eq("lesson_id", lesson_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch lesson progress: {exc}") from exc
        return response.data[0] if response.data else None

    def get_step_progress(
        self,
        *,
        user_id: str,
        step_id: str,
    ) -> LearnerStepProgressRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_step_progress")
                .select("*")
                .eq("user_id", user_id)
                .eq("step_id", step_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch step progress: {exc}") from exc
        return response.data[0] if response.data else None

    def project_step_completion(
        self,
        *,
        user_id: str,
        step_id: str,
        score: int | None = None,
        max_score: int | None = None,
    ) -> None:
        try:
            self.client.rpc("project_step_completion", {
                "p_user_id": user_id,
                "p_step_id": step_id,
                "p_score": score,
                "p_max_score": max_score,
            }).execute()
        except Exception as exc:
            raise InfraError(f"Failed to project step completion: {exc}") from exc

    def list_all_lesson_progress_for_training(
        self,
        training_id: str,
    ) -> list[LearnerLessonProgressRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_lesson_progress")
                .select("*")
                .eq("training_id", training_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list lesson progress: {exc}") from exc
        return response.data or []

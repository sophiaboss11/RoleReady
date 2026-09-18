from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import InfraError, NotFoundError
from app.repositories.types import (
    LearningEventRow,
    LearningSessionRow,
    StepAttemptRow,
)


class EngagementRepository:
    def __init__(self, client: Client):
        self.client = client

    # -- Learning Session --------------------------------------------------

    def create_session(self, row: LearningSessionRow) -> LearningSessionRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_session")
                .insert(row)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to create learning session: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create learning session")
        return response.data[0]

    def update_session(self, session_id: str, update_data: dict[str, Any]) -> LearningSessionRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_session")
                .update(update_data)
                .eq("id", session_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update learning session: {exc}") from exc
        if not response.data:
            raise NotFoundError("Learning session not found")
        return response.data[0]

    def get_session(self, session_id: str) -> LearningSessionRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_session")
                .select("*")
                .eq("id", session_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch learning session: {exc}") from exc
        if not response.data:
            raise NotFoundError("Learning session not found")
        return response.data[0]

    def find_active_session(
        self,
        *,
        user_id: str,
        training_id: str,
    ) -> LearningSessionRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_session")
                .select("*")
                .eq("user_id", user_id)
                .eq("training_id", training_id)
                .eq("status", "active")
                .order("started_at", desc=True)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to find active session: {exc}") from exc
        return response.data[0] if response.data else None

    def list_sessions_for_trainings(
        self,
        *,
        training_ids: list[str],
        started_from: str,
    ) -> list[LearningSessionRow]:
        unique_training_ids = list(set(training_ids))
        if not unique_training_ids:
            return []

        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_session")
                .select("*")
                .in_("training_id", unique_training_ids)
                .gte("started_at", started_from)
                .order("started_at")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list learning sessions: {exc}") from exc
        return response.data or []

    # -- Learning Event ----------------------------------------------------

    def create_event(self, row: LearningEventRow) -> LearningEventRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_event")
                .insert(row)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to create learning event: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create learning event")
        return response.data[0]

    def create_events_batch(self, rows: list[LearningEventRow]) -> list[LearningEventRow]:
        if not rows:
            return []
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_event")
                .insert(rows)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to create learning events: {exc}") from exc
        return response.data or []

    def list_events(
        self,
        *,
        session_id: str,
        limit: int = 500,
    ) -> list[LearningEventRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learning_event")
                .select("*")
                .eq("session_id", session_id)
                .order("created_at")
                .limit(limit)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list learning events: {exc}") from exc
        return response.data or []

    # -- Step Attempt ------------------------------------------------------

    def create_attempt(self, row: StepAttemptRow) -> StepAttemptRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("step_attempt")
                .insert(row)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to create step attempt: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create step attempt")
        return response.data[0]

    def update_attempt(self, attempt_id: str, update_data: dict[str, Any]) -> StepAttemptRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("step_attempt")
                .update(update_data)
                .eq("id", attempt_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update step attempt: {exc}") from exc
        if not response.data:
            raise NotFoundError("Step attempt not found")
        return response.data[0]

    def get_attempt(self, attempt_id: str) -> StepAttemptRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("step_attempt")
                .select("*")
                .eq("id", attempt_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch step attempt: {exc}") from exc
        if not response.data:
            raise NotFoundError("Step attempt not found")
        return response.data[0]

    def count_attempts(self, *, user_id: str, step_id: str) -> int:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("step_attempt")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("step_id", step_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to count attempts: {exc}") from exc
        return response.count or 0

    def list_attempts(
        self,
        *,
        user_id: str,
        step_id: str,
    ) -> list[StepAttemptRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("step_attempt")
                .select("*")
                .eq("user_id", user_id)
                .eq("step_id", step_id)
                .order("attempt_number")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list attempts: {exc}") from exc
        return response.data or []

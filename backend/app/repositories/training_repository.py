from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import DomainError, InfraError, NotFoundError
from app.repositories.types import (
    ModuleProgressRow,
    ProfileRow,
    TrainingAssignmentRow,
    TrainingModuleRow,
    TrainingRow,
)


class TrainingRepository:
    def __init__(self, client: Client):
        self.client = client

    def rpc_create_training_from_project(self, payload: dict[str, Any]) -> TrainingRow:
        return self._single_rpc_row(
            "create_training_from_project_atomic",
            payload,
            entity_name="training",
        )

    def rpc_reorder_training_modules(self, payload: dict[str, Any]) -> None:
        try:
            self.client.rpc("reorder_training_modules_atomic", payload).execute()
        except Exception as exc:
            raise InfraError(f"Failed to reorder training modules: {exc}") from exc

    def rpc_update_module_progress(self, payload: dict[str, Any]) -> ModuleProgressRow:
        return self._single_rpc_row(
            "update_module_progress_atomic",
            payload,
            entity_name="module progress",
        )

    def create_training(self, row: TrainingRow) -> TrainingRow:
        try:
            response = self.client.schema("RoleReady").table("training").insert(row).execute()
        except Exception as exc:
            raise InfraError(f"Failed to create training: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create training")
        return response.data[0]

    def update_training(self, training_id: str, update_data: dict[str, Any]) -> TrainingRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training")
                .update(update_data)
                .eq("id", training_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update training: {exc}") from exc
        if not response.data:
            raise NotFoundError("Training not found")
        return response.data[0]

    def delete_training(self, training_id: str) -> None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training")
                .delete()
                .eq("id", training_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete training: {exc}") from exc
        if not response.data:
            raise NotFoundError("Training not found")

    def get_training(self, training_id: str) -> TrainingRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training")
                .select("*")
                .eq("id", training_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch training: {exc}") from exc
        if not response.data:
            raise NotFoundError("Training not found")
        return response.data[0]

    def list_trainings(
        self,
        *,
        project_id: str | None,
        organization_id: str | None,
        limit: int,
        offset: int,
    ) -> list[TrainingRow]:
        try:
            if project_id:
                response = (
                    self.client.schema("RoleReady")
                    .table("training")
                    .select("*")
                    .eq("project_id", project_id)
                    .order("created_at", desc=True)
                    .range(offset, offset + limit - 1)
                    .execute()
                )
            else:
                response = (
                    self.client.schema("RoleReady")
                    .table("training")
                    .select("*, project:project_id!inner(organization_id)")
                    .eq("project.organization_id", organization_id)
                    .order("created_at", desc=True)
                    .range(offset, offset + limit - 1)
                    .execute()
                )
        except Exception as exc:
            raise InfraError(f"Failed to list trainings: {exc}") from exc
        return [self.strip_nested(row) for row in (response.data or [])]

    def create_module(self, row: TrainingModuleRow) -> TrainingModuleRow:
        try:
            response = self.client.schema("RoleReady").table("training_module").insert(row).execute()
        except Exception as exc:
            raise InfraError(f"Failed to create training module: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create module")
        return response.data[0]

    def update_module(
        self,
        *,
        training_id: str,
        module_id: str,
        update_data: dict[str, Any],
    ) -> TrainingModuleRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_module")
                .update(update_data)
                .eq("id", module_id)
                .eq("training_id", training_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update training module: {exc}") from exc
        if not response.data:
            raise NotFoundError("Module not found")
        return response.data[0]

    def delete_module(self, *, training_id: str, module_id: str) -> None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_module")
                .delete()
                .eq("id", module_id)
                .eq("training_id", training_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete training module: {exc}") from exc
        if not response.data:
            raise NotFoundError("Module not found")

    def list_modules(self, training_ids: list[str]) -> list[TrainingModuleRow]:
        if not training_ids:
            return []
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_module")
                .select("*")
                .in_("training_id", training_ids)
                .order("sort_order")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch training modules: {exc}") from exc
        return response.data or []

    def create_assignment(self, row: TrainingAssignmentRow) -> TrainingAssignmentRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_assignment")
                .insert(row)
                .execute()
            )
        except Exception as exc:
            message = str(exc).lower()
            if "duplicate key" in message or "unique" in message:
                raise DomainError("User is already assigned to this training") from exc
            raise InfraError(f"Failed to create training assignment: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create assignment")
        return response.data[0]

    def update_assignment(self, assignment_id: str, update_data: dict[str, Any]) -> TrainingAssignmentRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_assignment")
                .update(update_data)
                .eq("id", assignment_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update assignment: {exc}") from exc
        if not response.data:
            raise NotFoundError("Assignment not found")
        return response.data[0]

    def delete_assignment(self, assignment_id: str) -> None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_assignment")
                .delete()
                .eq("id", assignment_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete assignment: {exc}") from exc
        if not response.data:
            raise NotFoundError("Assignment not found")

    def get_assignment(self, assignment_id: str) -> TrainingAssignmentRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_assignment")
                .select("*")
                .eq("id", assignment_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch assignment: {exc}") from exc
        if not response.data:
            raise NotFoundError("Assignment not found")
        return response.data[0]

    def find_training_assignment(
        self,
        *,
        training_id: str,
        user_id: str,
    ) -> TrainingAssignmentRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_assignment")
                .select("*")
                .eq("training_id", training_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch viewer assignment: {exc}") from exc
        return response.data[0] if response.data else None

    def list_assignments(self, training_ids: list[str]) -> list[TrainingAssignmentRow]:
        if not training_ids:
            return []
        try:
            response = (
                self.client.schema("RoleReady")
                .table("training_assignment")
                .select("*")
                .in_("training_id", training_ids)
                .order("created_at", desc=True)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch training assignments: {exc}") from exc
        return response.data or []

    def list_progress(self, assignment_ids: list[str]) -> list[ModuleProgressRow]:
        if not assignment_ids:
            return []
        try:
            response = (
                self.client.schema("RoleReady")
                .table("module_progress")
                .select("*")
                .in_("assignment_id", assignment_ids)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch module progress: {exc}") from exc
        return response.data or []

    def list_org_member_user_ids(
        self,
        *,
        organization_id: str,
        assignee_ids: list[str],
    ) -> set[str]:
        try:
            response = (
                self.client.table("organization_member")
                .select("user_id")
                .eq("organization_id", organization_id)
                .in_("user_id", assignee_ids)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to validate assignee membership: {exc}") from exc
        return {row["user_id"] for row in response.data or []}

    def list_profiles(self, user_ids: list[str]) -> dict[str, ProfileRow]:
        if not user_ids:
            return {}
        unique_ids = list(set(user_ids))
        try:
            response = (
                self.client.table("profile")
                .select("id, display_name, avatar_url")
                .in_("id", unique_ids)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch profiles: {exc}") from exc
        return {row["id"]: row for row in (response.data or [])}

    @staticmethod
    def strip_nested(row: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in row.items() if not isinstance(value, dict)}

    def _single_rpc_row(self, name: str, payload: dict[str, Any], *, entity_name: str) -> dict[str, Any]:
        try:
            response = self.client.rpc(name, payload).execute()
        except Exception as exc:
            raise InfraError(f"Failed to execute rpc {name}: {exc}") from exc
        data = response.data
        if isinstance(data, list):
            if not data:
                raise InfraError(f"RPC returned no {entity_name} rows")
            return data[0]
        if isinstance(data, dict):
            return data
        raise InfraError(f"RPC returned unexpected payload for {entity_name}")

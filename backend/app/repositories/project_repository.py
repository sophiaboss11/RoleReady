from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import InfraError, NotFoundError
from app.repositories.types import DocumentRow, ProjectRow
from app.services.training.project_assets import list_project_assets


class ProjectRepository:
    def __init__(self, client: Client):
        self.client = client

    def create_project(self, row: ProjectRow) -> ProjectRow:
        try:
            response = self.client.schema("RoleReady").table("project").insert(row).execute()
        except Exception as exc:
            raise InfraError(f"Failed to create project: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create project")
        return response.data[0]

    def update_project(self, project_id: str, update_data: dict[str, Any]) -> ProjectRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project")
                .update(update_data)
                .eq("id", project_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update project: {exc}") from exc
        if not response.data:
            raise NotFoundError("Project not found")
        return response.data[0]

    def delete_project(self, project_id: str) -> None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project")
                .delete()
                .eq("id", project_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete project: {exc}") from exc
        if not response.data:
            raise NotFoundError("Project not found")

    def get_project(self, project_id: str) -> ProjectRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project")
                .select("*")
                .eq("id", project_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch project: {exc}") from exc
        if not response.data:
            raise NotFoundError("Project not found")
        return response.data[0]

    def list_projects(
        self,
        *,
        organization_id: str,
        limit: int,
        offset: int,
    ) -> list[ProjectRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project")
                .select("*")
                .eq("organization_id", organization_id)
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list projects: {exc}") from exc
        return response.data or []

    def create_document(self, row: DocumentRow) -> DocumentRow:
        try:
            response = self.client.schema("RoleReady").table("document").insert(row).execute()
        except Exception as exc:
            raise InfraError(f"Failed to upload document: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to upload document")
        return response.data[0]

    def list_documents(
        self,
        *,
        project_id: str,
        limit: int,
        offset: int,
    ) -> list[DocumentRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("document")
                .select("*")
                .eq("project_id", project_id)
                .range(offset, offset + limit - 1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list documents: {exc}") from exc
        return response.data or []

    def list_project_assets(self, project_id: str) -> list[dict[str, object]]:
        try:
            return list_project_assets(self.client, project_id)
        except Exception as exc:
            raise InfraError(f"Failed to list project assets: {exc}") from exc

    def update_project_status(self, project_id: str, update_data: dict[str, Any]) -> None:
        try:
            self.client.schema("RoleReady").table("project").update(update_data).eq(
                "id", project_id
            ).execute()
        except Exception as exc:
            raise InfraError(f"Failed to update project status: {exc}") from exc

    def get_project_status(self, project_id: str) -> str | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project")
                .select("status")
                .eq("id", project_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch status for project {project_id}: {exc}") from exc

        if not response.data:
            return None

        status = response.data[0].get("status")
        return str(status) if status is not None else None

    def project_has_documents(self, project_id: str) -> bool:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("document")
                .select("id")
                .eq("project_id", project_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to check documents for project {project_id}: {exc}") from exc
        return bool(response.data)

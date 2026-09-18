from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import InfraError, NotFoundError


class ContentRepository:
    def __init__(self, client: Client):
        self.client = client

    def get_project_asset(self, table_name: str, project_id: str) -> dict[str, Any]:
        row = self.find_project_asset(table_name, project_id)
        if row is None:
            raise NotFoundError(f"{table_name} not found for project {project_id}")
        return row

    def find_project_asset(
        self,
        table_name: str,
        project_id: str,
        *,
        columns: str = "*",
    ) -> dict[str, Any] | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table(table_name)
                .select(columns)
                .eq("project_id", project_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(
                f"Failed to fetch {table_name} for project {project_id}: {exc}"
            ) from exc
        if not response.data:
            return None
        return response.data[0]

    def list_project_embedding_rows(
        self,
        project_id: str,
        *,
        columns: str,
        page_size: int,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        try:
            while True:
                response = (
                    self.client.schema("RoleReady")
                    .table("embedding")
                    .select(columns)
                    .eq("project_id", project_id)
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                batch = response.data or []
                if not batch:
                    return rows
                rows.extend(batch)
                if len(batch) < page_size:
                    return rows
                offset += page_size
        except Exception as exc:
            raise InfraError(f"Failed to fetch embeddings for project {project_id}: {exc}") from exc

    def upsert_project_summary(self, project_id: str, summary: str, updated_at: str) -> None:
        try:
            (
                self.client.schema("RoleReady")
                .table("project_summary")
                .upsert(
                    {
                        "project_id": project_id,
                        "content": summary,
                        "status": bool(summary),
                        "updated_at": updated_at,
                    },
                    on_conflict="project_id",
                )
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to save summary for project {project_id}: {exc}") from exc

    def upsert_project_asset(self, table_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = payload.get("project_id")
        if not isinstance(project_id, str) or not project_id:
            raise InfraError(f"Cannot save {table_name} without a project_id")

        existing = self.find_project_asset(
            table_name,
            project_id,
            columns="id",
        )

        try:
            if existing:
                response = (
                    self.client.schema("RoleReady")
                    .table(table_name)
                    .update(payload)
                    .eq("id", existing["id"])
                    .execute()
                )
            else:
                response = (
                    self.client.schema("RoleReady")
                    .table(table_name)
                    .insert(payload)
                    .execute()
                )
        except Exception as exc:
            raise InfraError(f"Failed to save {table_name} for project {project_id}: {exc}") from exc

        if not response.data:
            raise InfraError(f"Failed to save {table_name} for project {project_id}")
        return response.data[0]

    def list_project_rows(
        self,
        table_name: str,
        project_id: str,
        *,
        columns: str = "*",
    ) -> list[dict[str, Any]]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table(table_name)
                .select(columns)
                .eq("project_id", project_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch {table_name} rows for project {project_id}: {exc}") from exc

        return [row for row in (response.data or []) if isinstance(row, dict)]

    def delete_project_rows(self, table_name: str, project_id: str) -> int:
        try:
            response = (
                self.client.schema("RoleReady")
                .table(table_name)
                .delete()
                .eq("project_id", project_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to delete {table_name} rows for project {project_id}: {exc}") from exc

        return len(response.data or [])

    def replace_project_rows(
        self,
        table_name: str,
        payloads: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not payloads:
            raise InfraError(f"Cannot save {table_name} without any rows")

        project_id = payloads[0].get("project_id")
        if not isinstance(project_id, str) or not project_id:
            raise InfraError(f"Cannot save {table_name} without a project_id")

        for payload in payloads:
            row_project_id = payload.get("project_id")
            if row_project_id != project_id:
                raise InfraError(f"Cannot save {table_name} rows with mixed project_id values")

        self.delete_project_rows(table_name, project_id)

        try:
            response = (
                self.client.schema("RoleReady")
                .table(table_name)
                .insert(payloads)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to save {table_name} rows for project {project_id}: {exc}") from exc

        if not response.data:
            raise InfraError(f"Failed to save {table_name} rows for project {project_id}")

        return [row for row in response.data if isinstance(row, dict)]

    def is_processed_asset_ready(
        self,
        table_name: str,
        project_id: str,
        *,
        processed_column: str = "is_processed",
    ) -> bool:
        row = self.find_project_asset(
            table_name,
            project_id,
            columns=processed_column,
        )
        if row is None:
            return False
        return bool(row.get(processed_column))

    def match_embedding(
        self,
        *,
        query_embedding: list[float],
        match_count: int,
        filter_project_id: str | None,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {
            "query_embedding": query_embedding,
            "match_count": match_count,
            "filter_project_id": filter_project_id,
        }

        try:
            response = self.client.rpc("match_embedding", payload).execute()
        except Exception as exc:
            raise InfraError(f"Error calling Supabase RPC match_embedding: {exc}") from exc

        if not isinstance(response.data, list):
            return []
        return [row for row in response.data if isinstance(row, dict)]

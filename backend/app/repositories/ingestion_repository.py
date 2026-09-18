from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import InfraError


class EmbeddingRepository:
    def __init__(self, client: Client):
        self.client = client

    def delete_for_scope(
        self,
        *,
        project_id: str | None = None,
        source: str | None = None,
        document_ids: list[str] | None = None,
    ) -> None:
        try:
            query = self.client.schema("RoleReady").table("embedding").delete()
            if project_id:
                query = query.eq("project_id", project_id)
            if source:
                query = query.eq("source", source)
            if document_ids:
                query = query.in_("document_id", document_ids)
            query.execute()
        except Exception as exc:
            raise InfraError(f"Failed to delete embeddings for scope: {exc}") from exc

    def insert_rows(self, rows: list[dict[str, Any]]) -> int:
        try:
            response = self.client.schema("RoleReady").table("embedding").insert(rows).execute()
        except Exception as exc:
            raise InfraError(f"Failed to insert embedding rows: {exc}") from exc
        return len(response.data or [])


class DocumentRepository:
    def __init__(self, client: Client):
        self.client = client

    def list_documents(
        self,
        *,
        project_id: str | None,
        document_ids: list[str] | None,
        limit: int,
        ignore_processed: bool,
    ) -> list[dict[str, Any]]:
        query = self.client.schema("RoleReady").table("document").select("*")

        if not ignore_processed:
            query = query.eq("processed", False)
        if project_id:
            query = query.eq("project_id", project_id)
        if document_ids:
            query = query.in_("id", document_ids)
        if not document_ids:
            query = query.limit(limit)

        try:
            response = query.execute()
        except Exception as exc:
            raise InfraError(f"Failed to fetch documents for embedding: {exc}") from exc
        return response.data or []

    def mark_processed(self, doc_ids: list[str]) -> None:
        if not doc_ids:
            return
        try:
            (
                self.client.schema("RoleReady")
                .table("document")
                .update({"processed": True})
                .in_("id", doc_ids)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to mark documents processed: {exc}") from exc

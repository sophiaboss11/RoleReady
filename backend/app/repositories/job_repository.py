from __future__ import annotations

from typing import Any

from postgrest.exceptions import APIError
from supabase import Client

from app.core.exceptions import InfraError
from app.models.job import JobType, JobStatus


class JobRepository:
    def __init__(self, client: Client):
        self.client = client

    def create_job(self, project_id: str, user_id: str, job_type: JobType) -> dict[str, Any]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("job")
                .insert(
                    {
                        "project_id": project_id,
                        "user_id": user_id,
                        "job_type": job_type,
                        "status": "pending",
                    }
                )
                .execute()
            )
        except APIError as exc:
            raise InfraError(f"Failed to create job: {exc.message}") from exc

        if not response.data:
            raise InfraError("Failed to create job: no data returned")
        return response.data[0]

    def update_job_status(
        self,
        *,
        job_id: str,
        status: JobStatus,
        error_message: str | None = None,
    ) -> None:
        update_data: dict[str, Any] = {"status": status}
        if error_message is not None:
            update_data["error_message"] = error_message

        try:
            self.client.schema("RoleReady").table("job").update(update_data).eq("id", job_id).execute()
        except APIError as exc:
            raise InfraError(f"Failed to update job {job_id}: {exc.message}") from exc

    def list_jobs_for_project(
        self,
        *,
        project_id: str,
        job_type: JobType | None,
    ) -> list[dict[str, Any]]:
        query = (
            self.client.schema("RoleReady")
            .table("job")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
        )
        if job_type:
            query = query.eq("job_type", job_type)

        try:
            response = query.execute()
        except APIError as exc:
            raise InfraError(f"Failed to fetch jobs: {exc.message}") from exc
        return response.data or []

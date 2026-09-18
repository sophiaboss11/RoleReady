from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import InfraError


class PromptRepository:
    def __init__(self, client: Client):
        self.client = client

    def list_defaults(self) -> list[dict[str, Any]]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("prompt_default")
                .select("*")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch prompt defaults: {exc}") from exc
        return response.data or []

    def get_default_instruction(self, prompt_type: str) -> str | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("prompt_default")
                .select("instruction")
                .eq("prompt_type", prompt_type)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch default prompt '{prompt_type}': {exc}") from exc

        if not response.data:
            return None

        instruction = response.data[0].get("instruction")
        return str(instruction) if isinstance(instruction, str) else None

    def get_project_prompt(
        self,
        *,
        project_id: str,
        prompt_type: str,
    ) -> dict[str, Any] | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project_prompt")
                .select("*")
                .eq("project_id", project_id)
                .eq("prompt_type", prompt_type)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(
                f"Failed to fetch prompt override for project {project_id} / {prompt_type}: {exc}"
            ) from exc
        return response.data[0] if response.data else None

    def list_project_prompts(self, project_id: str) -> list[dict[str, Any]]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project_prompt")
                .select("*")
                .eq("project_id", project_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch prompts for project {project_id}: {exc}") from exc
        return response.data or []

    def upsert_project_prompt(
        self,
        *,
        project_id: str,
        prompt_type: str,
        instruction: str,
    ) -> dict[str, Any]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project_prompt")
                .upsert(
                    {
                        "project_id": project_id,
                        "prompt_type": prompt_type,
                        "instruction": instruction,
                    },
                    on_conflict="project_id,prompt_type",
                )
                .execute()
            )
        except Exception as exc:
            raise InfraError(
                f"Failed to upsert prompt for project {project_id} / {prompt_type}: {exc}"
            ) from exc

        if not response.data:
            raise InfraError(f"Failed to upsert prompt for project {project_id} / {prompt_type}")
        return response.data[0]

    def delete_project_prompt(
        self,
        *,
        project_id: str,
        prompt_type: str,
    ) -> bool:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("project_prompt")
                .delete()
                .eq("project_id", project_id)
                .eq("prompt_type", prompt_type)
                .execute()
            )
        except Exception as exc:
            raise InfraError(
                f"Failed to delete prompt for project {project_id} / {prompt_type}: {exc}"
            ) from exc
        return bool(response.data)

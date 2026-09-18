"""
Prompt Service – CRUD and default resolution for per-project AI instructions.

Each generation type (summary, narration, mindmap, infographic_text) has a
default instruction stored in the ``prompt_default`` DB table (seeded by
migration). Users may override these on a per-project basis via the
``project_prompt`` table.

Resolution order:
    1. project_prompt  (per-project user override)
    2. prompt_default  (system default, DB-seeded by migration)

Single source of truth for default prompt text is the migration:
    frontend/supabase/migrations/20260301080000_create_project_prompt_table.sql
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.repositories.factory import build_prompt_repository
from app.repositories.prompt_repository import PromptRepository

logger = logging.getLogger(__name__)


def get_all_defaults(repo: PromptRepository) -> List[Dict[str, Any]]:
    """Fetch all rows from prompt_default."""
    return repo.list_defaults()


def get_default_instruction(repo: PromptRepository, prompt_type: str) -> Optional[str]:
    """Fetch a single default instruction from prompt_default."""
    return repo.get_default_instruction(prompt_type)


def get_prompt_for_project(
    repo: PromptRepository,
    project_id: str,
    prompt_type: str,
) -> Optional[Dict[str, Any]]:
    """Fetch a single custom prompt for a project + type pair."""
    return repo.get_project_prompt(project_id=project_id, prompt_type=prompt_type)


def get_all_prompts_for_project(
    repo: PromptRepository,
    project_id: str,
) -> List[Dict[str, Any]]:
    """Fetch all custom prompts saved for a project."""
    return repo.list_project_prompts(project_id)


def upsert_prompt(
    repo: PromptRepository,
    project_id: str,
    prompt_type: str,
    instruction: str,
) -> Dict[str, Any]:
    """Insert or update a custom prompt instruction for a project."""
    return repo.upsert_project_prompt(
        project_id=project_id,
        prompt_type=prompt_type,
        instruction=instruction,
    )


def delete_prompt(repo: PromptRepository, project_id: str, prompt_type: str) -> bool:
    """Remove a per-project override so the project reverts to the system default."""
    return repo.delete_project_prompt(project_id=project_id, prompt_type=prompt_type)


def resolve_instruction(
    project_id: str,
    prompt_type: str,
    *,
    repo: PromptRepository | None = None,
) -> str:
    """Return per-project instruction → DB default.

    Raises RuntimeError if neither source provides an instruction,
    which indicates a missing DB seed (migration not applied).
    """
    prompt_repo = repo or build_prompt_repository()

    try:
        row = get_prompt_for_project(prompt_repo, project_id, prompt_type)
        if row:
            instruction = row.get("instruction")
            if isinstance(instruction, str) and instruction:
                return instruction
    except Exception as exc:
        logger.warning(
            "Failed to fetch custom prompt for project %s / %s: %s",
            project_id,
            prompt_type,
            exc,
        )

    try:
        db_default = get_default_instruction(prompt_repo, prompt_type)
        if db_default:
            return db_default
    except Exception as exc:
        logger.error("Failed to fetch DB default for %s: %s", prompt_type, exc)

    raise RuntimeError(
        f"No instruction found for prompt_type '{prompt_type}'. "
        "Ensure the prompt_default table is seeded (run migrations)."
    )

import logging
from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter

from app.core.auth import CurrentUser, ProjectMemberAccess, authorize_project_admin
from app.repositories.factory import build_prompt_repository
from app.schemas.prompt import PromptUpsertRequest
from app.services.content_generation.prompt_service import (
    delete_prompt,
    get_all_defaults,
    get_all_prompts_for_project,
    upsert_prompt,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/defaults", response_model=List[Dict[str, Any]])
async def get_default_prompts() -> List[Dict[str, Any]]:
    """Return all system-wide default instructions from the DB."""
    return get_all_defaults(build_prompt_repository())


@router.get("/{project_id}", response_model=List[Dict[str, Any]])
async def get_project_prompts(access: ProjectMemberAccess) -> List[Dict[str, Any]]:
    """Return all custom prompts saved for a project."""
    return get_all_prompts_for_project(build_prompt_repository(), access.project_id)


@router.put("/", response_model=Dict[str, Any])
async def save_prompt(
    request: PromptUpsertRequest,
    user: CurrentUser,
) -> Dict[str, Any]:
    """Create or update a custom prompt instruction. Admin role required."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)
    return upsert_prompt(
        build_prompt_repository(),
        project_id_str,
        request.prompt_type,
        request.instruction,
    )


@router.delete("/{project_id}/{prompt_type}")
async def remove_prompt(
    project_id: UUID,
    prompt_type: str,
    user: CurrentUser,
) -> Dict[str, bool]:
    """Delete a custom prompt override, reverting to system default. Admin role required."""
    project_id_str = str(project_id)
    await authorize_project_admin(user, project_id_str)
    deleted = delete_prompt(build_prompt_repository(), project_id_str, prompt_type)
    return {"deleted": deleted}

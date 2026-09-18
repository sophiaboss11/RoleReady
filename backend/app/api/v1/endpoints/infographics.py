from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.auth import (
    CurrentUser,
    ProjectMemberAccess,
    authorize_project_admin,
)
from app.core.config import get_settings
from app.services.content_generation.infographic_service import (
    get_infographic_for_project,
)
from app.services.job_dispatch import (
    enqueue_tracked_cloud_job,
    run_tracked_job,
    start_tracked_job,
)
from app.services.pipeline_steps import run_infographic_generation

router = APIRouter()


class InfographicGenerateRequest(BaseModel):
    project_id: UUID


@router.get("/{project_id}", response_model=Dict[str, Any])
async def get_infographic(
    access: ProjectMemberAccess,
):
    """Retrieve an existing infographic for a project."""
    return get_infographic_for_project(access.project_id)


@router.post("/generate")
async def generate_project_infographic(
    request: InfographicGenerateRequest,
    user: CurrentUser,
):
    """Generate or regenerate an infographic for a project. Admin role required."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)

    job = start_tracked_job(project_id_str, user.user_id, "infographic_generation")
    job_id = job["id"]

    settings = get_settings()
    if settings.use_cloud_tasks:
        enqueue_tracked_cloud_job(
            job_id=job_id,
            job_type="infographic_generation",
            project_id=project_id_str,
        )
        return {"job_id": job_id, "status": "pending"}

    return run_tracked_job(
        job_id=job_id,
        job_type="infographic_generation",
        project_id=project_id_str,
        runner=lambda: run_infographic_generation(project_id_str),
    )

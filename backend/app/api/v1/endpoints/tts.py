from typing import Any, Dict

from fastapi import APIRouter

from app.core.auth import (
    CurrentUser,
    ProjectMemberAccess,
    authorize_project_admin,
)
from app.core.config import get_settings
from app.schemas.tts import TTSGenerateRequest
from app.services.content_generation.tts_service import (
    get_audio_for_project,
)
from app.services.job_dispatch import (
    enqueue_tracked_cloud_job,
    run_tracked_job,
    start_tracked_job,
)
from app.services.pipeline_steps import run_tts_generation

router = APIRouter()


@router.get("/{project_id}", response_model=Dict[str, Any])
async def get_audio(
    access: ProjectMemberAccess,
):
    """Retrieve an existing audio record for a project."""
    return get_audio_for_project(access.project_id)


@router.post("/generate")
async def generate_project_audio(
    request: TTSGenerateRequest,
    user: CurrentUser,
):
    """Generate or regenerate TTS audio for a project. Admin role required."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)

    job = start_tracked_job(project_id_str, user.user_id, "tts_generation")
    job_id = job["id"]

    settings = get_settings()
    if settings.use_cloud_tasks:
        enqueue_tracked_cloud_job(
            job_id=job_id,
            job_type="tts_generation",
            project_id=project_id_str,
            params={
                "voice": request.voice,
                "model": request.model,
                "format": request.format,
            },
        )
        return {"job_id": job_id, "status": "pending"}

    return run_tracked_job(
        job_id=job_id,
        job_type="tts_generation",
        project_id=project_id_str,
        runner=lambda: run_tts_generation(
            project_id_str,
            voice=request.voice,
            model=request.model,
            fmt=request.format,
        ),
    )

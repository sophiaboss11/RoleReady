from __future__ import annotations

from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from app.core.auth import CurrentUser, ProjectMemberAccess, authorize_project_admin
from app.core.config import get_settings
from app.services.project_status_service import get_project
from app.schemas.video import (
    ProjectVideoResponse,
    VideoGenerateRequest,
    VideoGenerationResponse,
)
from app.services.content_generation.video_service import get_video_for_project
from app.services.job_dispatch import (
    enqueue_tracked_cloud_job,
    run_tracked_job,
    start_tracked_job,
)
from app.services.pipeline_steps import run_video_generation

router = APIRouter()


class _SafeFormatDict(dict):
    def __missing__(self, key: str) -> str:
        return ""


def _build_video_prompt(*, project_id: str) -> str:
    settings = get_settings()
    project = get_project(project_id)
    title = str((project or {}).get("title") or "Project")
    description = str((project or {}).get("description") or "").strip()
    template = str(getattr(settings, "video_prompt_template", "") or "").strip()

    if template:
        prompt = template.format_map(
            _SafeFormatDict(
                {
                    "project_id": project_id,
                    "title": title,
                    "description": description,
                }
            )
        ).strip()
    else:
        prompt = title

    # Keep prompt bounded (matches the previous API validation intent).
    if len(prompt) > 2000:
        prompt = prompt[:2000]
    if not prompt:
        prompt = "Create a single cohesive 10-minute educational video about this project."
    return prompt


@router.get("/{project_id}", response_model=ProjectVideoResponse)
async def get_video(access: ProjectMemberAccess):
    """Retrieve an existing video presentation for a project."""
    return ProjectVideoResponse(**get_video_for_project(access.project_id))


@router.post("/generate")
async def generate_project_video(
    request: VideoGenerateRequest,
    user: CurrentUser,
):
    """Generate or regenerate a narrated slideshow video for a project."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)

    settings = get_settings()
    prompt = _build_video_prompt(project_id=project_id_str)
    max_docs = int(getattr(settings, "video_max_docs", 6) or 6)
    require_context = bool(getattr(settings, "video_require_context", True))
    max_slides = int(getattr(settings, "video_max_slides", 8) or 8)
    voice = str(getattr(settings, "video_voice", "alloy") or "alloy")
    model = str(getattr(settings, "video_model", "tts-1") or "tts-1")
    fmt = str(getattr(settings, "video_format", "mp3") or "mp3")

    job = start_tracked_job(project_id_str, user.user_id, "video_generation")
    job_id = job["id"]

    if settings.use_cloud_tasks:
        enqueue_tracked_cloud_job(
            job_id=job_id,
            job_type="video_generation",
            project_id=project_id_str,
            params={
                "prompt": prompt,
                "max_docs": max_docs,
                "require_context": require_context,
                "max_slides": max_slides,
                "voice": voice,
                "model": model,
                "format": fmt,
            },
        )
        return {"job_id": job_id, "status": "pending"}

    saved = await run_in_threadpool(
        lambda: run_tracked_job(
            job_id=job_id,
            job_type="video_generation",
            project_id=project_id_str,
            runner=lambda: run_video_generation(
                project_id_str,
                prompt=prompt,
                max_docs=max_docs,
                require_context=require_context,
                max_slides=max_slides,
                voice=voice,
                model=model,
                fmt=fmt,
            ),
        )
    )
    return VideoGenerationResponse(
        video_url=str(saved.get("video_url") or ""),
        retrieved_count=int(saved.get("retrieved_count") or 0),
        slide_count=int(saved.get("slide_count") or 0),
        warning=saved.get("warning"),
    )

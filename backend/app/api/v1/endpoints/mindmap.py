from typing import Optional
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.auth import (
    CurrentUser,
    ProjectMemberAccess,
    authorize_project_admin,
)
from app.core.config import get_settings
from app.services.content_generation.mindmap_service import (
    get_mindmap_for_project,
)
from app.services.job_dispatch import (
    enqueue_tracked_cloud_job,
    run_tracked_job,
    start_tracked_job,
)
from app.services.pipeline_steps import run_mindmap_generation

router = APIRouter()


class MindmapRequest(BaseModel):
    query: str
    project_id: UUID
    max_docs: int = 6
    require_context: bool = True


class MindmapResponse(BaseModel):
    mermaid: str
    retrievedCount: int
    warning: Optional[str] = None


@router.get("/{project_id}", response_model=MindmapResponse)
async def get_mindmap(access: ProjectMemberAccess):
    """Retrieve an existing mindmap for a project."""
    record = get_mindmap_for_project(access.project_id)
    return MindmapResponse(
        mermaid=record.get("mermaid", ""),
        retrievedCount=int(record.get("retrieved_count", 0)),
        warning=record.get("warning"),
    )


@router.post("/generate")
async def generate_mindmap_endpoint(request: MindmapRequest, user: CurrentUser):
    """Generate a Mermaid mindmap using Gemini + Supabase vector search."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)

    job = start_tracked_job(project_id_str, user.user_id, "mindmap_generation")
    job_id = job["id"]

    settings = get_settings()
    if settings.use_cloud_tasks:
        enqueue_tracked_cloud_job(
            job_id=job_id,
            job_type="mindmap_generation",
            project_id=project_id_str,
            params={
                "query": request.query,
                "max_docs": request.max_docs,
                "require_context": request.require_context,
            },
        )
        return {"job_id": job_id, "status": "pending"}

    saved = run_tracked_job(
        job_id=job_id,
        job_type="mindmap_generation",
        project_id=project_id_str,
        runner=lambda: run_mindmap_generation(
            project_id_str,
            query=request.query,
            max_docs=request.max_docs,
            require_context=request.require_context,
        ),
    )
    return MindmapResponse(
        mermaid=saved["mermaid"],
        retrievedCount=int(saved["retrieved_count"]),
        warning=saved.get("warning"),
    )

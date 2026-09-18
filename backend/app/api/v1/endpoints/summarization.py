from fastapi import APIRouter
from pydantic import BaseModel
from uuid import UUID

from app.core.auth import (
    CurrentUser,
    ProjectMemberAccess,
    authorize_project_admin,
)
from app.repositories.factory import build_content_repository
from app.services.content_generation.queries import get_project_summary_record
from app.services.content_generation.summarization import summarize_embeddings

router = APIRouter()


class SummarizationRequest(BaseModel):
    project_id: UUID  # Required - must provide project_id


class SummarizationResponse(BaseModel):
    summary: str
    embeddings_count: int
    project_id: str
    saved_to_db: bool


@router.post("/generate", response_model=SummarizationResponse)
async def generate_summary(request: SummarizationRequest, user: CurrentUser):
    """
    Generate an overall project summary based on ALL embeddings for the given project.
    Fetches all embeddings with the specified project_id and creates one comprehensive summary.
    Admin role required.
    
    Args:
        request: Contains required project_id
    
    Returns:
        Overall project summary and metadata
    """
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)
    result = summarize_embeddings(project_id=project_id_str)
    return SummarizationResponse(**result)


@router.get("/{project_id}")
async def get_existing_summary(access: ProjectMemberAccess):
    """
    Retrieve an existing summary from the database for a given project.
    
    Args:
        project_id: Project ID to retrieve summary for
    
    Returns:
        Existing summary data if found
    """
    return get_project_summary_record(build_content_repository(), access.project_id)

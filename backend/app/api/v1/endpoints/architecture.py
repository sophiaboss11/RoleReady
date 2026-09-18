from fastapi import APIRouter

from app.core.auth import CurrentUser, ProjectMemberAccess, authorize_project_admin
from app.schemas.architecture import ArchitectureGenerateRequest, ArchitectureResponse
from app.services.content_generation.architecture_service import (
    generate_and_save_architecture,
    get_architecture_for_project,
)

router = APIRouter()



@router.post("/generate", response_model=ArchitectureResponse)
async def generate_architecture(request: ArchitectureGenerateRequest, user: CurrentUser):
    project_id = str(request.project_id)
    await authorize_project_admin(user, project_id)
    return ArchitectureResponse(**generate_and_save_architecture(project_id))


@router.get("/{project_id}", response_model=ArchitectureResponse)
async def get_architecture(access: ProjectMemberAccess):
    return ArchitectureResponse(**get_architecture_for_project(access.project_id))


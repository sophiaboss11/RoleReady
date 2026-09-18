from fastapi import APIRouter

from app.core.auth import CurrentUser, ProjectMemberAccess, authorize_project_admin
from app.schemas.pinpoint import PinpointGenerateRequest, PinpointGenerationResponse, PinpointQuestionResponse
from app.services.content_generation.pinpoint_service import (
    generate_and_save_pinpoint_questions,
    get_pinpoint_questions_for_project,
)

router = APIRouter()


@router.get("/{project_id}", response_model=PinpointGenerationResponse)
async def get_pinpoint_questions(access: ProjectMemberAccess):
    rows = get_pinpoint_questions_for_project(access.project_id)
    return PinpointGenerationResponse(
        project_id=access.project_id,
        question_count=len(rows),
        questions=[PinpointQuestionResponse(**row) for row in rows],
    )


@router.post("/generate", response_model=PinpointGenerationResponse)
async def generate_pinpoint_questions(request: PinpointGenerateRequest, user: CurrentUser):
    project_id = str(request.project_id)
    await authorize_project_admin(user, project_id)

    saved_rows = generate_and_save_pinpoint_questions(
        project_id=project_id,
        question_count=request.question_count,
    )

    return PinpointGenerationResponse(
        project_id=project_id,
        question_count=len(saved_rows),
        questions=[PinpointQuestionResponse(**row) for row in saved_rows],
    )

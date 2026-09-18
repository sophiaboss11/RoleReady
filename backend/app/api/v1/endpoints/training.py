"""Training API endpoints."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.core.auth import (
    AssignmentAccess,
    CurrentUser,
    TrainingAdminAccess,
    TrainingMemberAccess,
    authorize_organization_admin,
    authorize_organization_member,
    get_project_organization_id,
)
from app.repositories.factory import build_training_repository
from app.repositories.factory import build_gamification_repository
from app.schemas.training import (
    ModuleProgressResponse,
    ModuleProgressUpdate,
    ModuleReorderRequest,
    TrainingAssignmentCreate,
    TrainingAssignmentResponse,
    TrainingAssignmentUpdate,
    TrainingCreate,
    TrainingModuleCreate,
    TrainingModuleResponse,
    TrainingModuleUpdate,
    TrainingOverviewResponse,
    TrainingResponse,
    TrainingSummaryResponse,
    TrainingUpdate,
)
from app.services.training.commands import (
    create_assignment_record,
    create_module_record,
    create_training_record,
    delete_assignment_record,
    delete_module_record,
    delete_training_record,
    reorder_training_modules,
    update_assignment_record,
    update_module_progress_record,
    update_module_record,
    update_training_record,
)
from app.services.training.cover_jobs import schedule_training_cover_generation
from app.services.training.queries import (
    get_assignment_record_with_progress,
    get_training_overview_record,
    get_training_record,
    list_assignment_records_with_progress,
    list_module_records,
    list_progress_records,
    list_training_summary_records,
)

router = APIRouter()
assignment_router = APIRouter()


@router.post("/", response_model=TrainingResponse)
async def create_training(
    body: TrainingCreate,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
):
    project_id = str(body.project_id)
    organization_id = await get_project_organization_id(project_id)
    await authorize_organization_admin(user, organization_id)

    row = create_training_record(
        build_training_repository(),
        project_id=project_id,
        title=body.title,
        description=body.description,
        created_by=user.user_id,
        status="draft",
    )
    schedule_training_cover_generation(
        background_tasks,
        project_id=project_id,
        training_id=row["id"],
        user_id=user.user_id,
    )
    return TrainingResponse(**row)


@router.get("/", response_model=List[TrainingSummaryResponse])
async def list_trainings(
    user: CurrentUser,
    project_id: Optional[UUID] = Query(None),
    organization_id: Optional[str] = Query(None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    if project_id:
        await authorize_organization_member(user, await get_project_organization_id(str(project_id)))
    elif organization_id:
        await authorize_organization_member(user, organization_id)

    rows = list_training_summary_records(
        build_training_repository(),
        viewer_user_id=user.user_id,
        project_id=str(project_id) if project_id else None,
        organization_id=organization_id,
        limit=limit,
        offset=offset,
    )
    return [TrainingSummaryResponse(**row) for row in rows]


@router.get("/{training_id}/overview", response_model=TrainingOverviewResponse)
async def get_training_overview(access: TrainingMemberAccess):
    row = get_training_overview_record(
        build_training_repository(),
        training_id=access.training_id,
        viewer_user_id=access.user_id,
        is_admin=access.is_admin,
    )
    return TrainingOverviewResponse(**row)


@router.get("/{training_id}", response_model=TrainingResponse)
async def get_training(access: TrainingMemberAccess):
    row = get_training_record(build_training_repository(), access.training_id)
    return TrainingResponse(**row)


@router.put("/{training_id}", response_model=TrainingResponse)
async def update_training(body: TrainingUpdate, access: TrainingAdminAccess):
    row = update_training_record(
        build_training_repository(),
        training_id=access.training_id,
        title=body.title,
        description=body.description,
        status=body.status,
    )
    return TrainingResponse(**row)


@router.delete("/{training_id}")
async def delete_training(access: TrainingAdminAccess):
    delete_training_record(build_training_repository(), access.training_id)
    return {"message": "Training deleted successfully"}


@router.post("/{training_id}/modules", response_model=TrainingModuleResponse)
async def create_module(body: TrainingModuleCreate, access: TrainingAdminAccess):
    row = create_module_record(
        build_training_repository(),
        training_id=access.training_id,
        title=body.title,
        description=body.description,
        module_type=body.module_type,
        sort_order=body.sort_order,
        content_url=body.content_url,
        content_body=body.content_body,
        is_required=body.is_required,
        estimated_duration_minutes=body.estimated_duration_minutes,
    )
    return TrainingModuleResponse(**row)


@router.get("/{training_id}/modules", response_model=List[TrainingModuleResponse])
async def list_modules(access: TrainingMemberAccess):
    rows = list_module_records(build_training_repository(), access.training_id)
    return [TrainingModuleResponse(**row) for row in rows]


@router.put("/{training_id}/modules/{module_id}", response_model=TrainingModuleResponse)
async def update_module(module_id: UUID, body: TrainingModuleUpdate, access: TrainingAdminAccess):
    row = update_module_record(
        build_training_repository(),
        training_id=access.training_id,
        module_id=str(module_id),
        title=body.title,
        description=body.description,
        module_type=body.module_type,
        sort_order=body.sort_order,
        content_url=body.content_url,
        content_body=body.content_body,
        is_required=body.is_required,
        estimated_duration_minutes=body.estimated_duration_minutes,
    )
    return TrainingModuleResponse(**row)


@router.delete("/{training_id}/modules/{module_id}")
async def delete_module(module_id: UUID, access: TrainingAdminAccess):
    delete_module_record(
        build_training_repository(),
        training_id=access.training_id,
        module_id=str(module_id),
    )
    return {"message": "Module deleted successfully"}


@router.put("/{training_id}/modules/reorder")
async def reorder_modules(body: ModuleReorderRequest, access: TrainingAdminAccess):
    reorder_training_modules(
        build_training_repository(),
        training_id=access.training_id,
        modules=[
            {"module_id": str(item.module_id), "sort_order": item.sort_order}
            for item in body.modules
        ],
    )
    return {"message": "Modules reordered successfully"}


@router.post("/{training_id}/assignments", response_model=TrainingAssignmentResponse)
async def create_assignment(body: TrainingAssignmentCreate, access: TrainingAdminAccess):
    row = create_assignment_record(
        build_training_repository(),
        training_id=access.training_id,
        organization_id=access.organization_id,
        user_id=str(body.user_id),
        assigned_by=access.user_id,
        due_date=body.due_date,
    )
    return TrainingAssignmentResponse(**row)


@router.get("/{training_id}/assignments", response_model=List[TrainingAssignmentResponse])
async def list_assignments(access: TrainingAdminAccess):
    rows = list_assignment_records_with_progress(
        build_training_repository(),
        training_id=access.training_id,
    )
    return [TrainingAssignmentResponse(**row) for row in rows]


@assignment_router.get("/{assignment_id}", response_model=TrainingAssignmentResponse)
async def get_assignment(access: AssignmentAccess):
    row = get_assignment_record_with_progress(build_training_repository(), access.assignment_id)
    return TrainingAssignmentResponse(**row)


@assignment_router.put("/{assignment_id}", response_model=TrainingAssignmentResponse)
async def update_assignment(body: TrainingAssignmentUpdate, access: AssignmentAccess):
    update_assignment_record(
        build_training_repository(),
        assignment_id=access.assignment_id,
        training_id=access.training_id,
        status=body.status,
        due_date=body.due_date,
    )
    row = get_assignment_record_with_progress(build_training_repository(), access.assignment_id)
    return TrainingAssignmentResponse(**row)


@assignment_router.delete("/{assignment_id}")
async def delete_assignment(access: AssignmentAccess):
    if not access.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can delete assignments")

    delete_assignment_record(build_training_repository(), access.assignment_id)
    return {"message": "Assignment deleted successfully"}


@assignment_router.get("/{assignment_id}/progress", response_model=List[ModuleProgressResponse])
async def get_progress(access: AssignmentAccess):
    rows = list_progress_records(build_training_repository(), access.assignment_id)
    return [ModuleProgressResponse(**row) for row in rows]


@assignment_router.put(
    "/{assignment_id}/modules/{module_id}/progress",
    response_model=ModuleProgressResponse,
)
async def update_progress(module_id: UUID, body: ModuleProgressUpdate, access: AssignmentAccess):
    if not access.is_assignee and not access.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only the assignee or an admin can update progress",
        )

    repo = build_training_repository()
    row = update_module_progress_record(
        repo,
        assignment_id=access.assignment_id,
        training_id=access.training_id,
        module_id=str(module_id),
        status=body.status,
        progress_pct=body.progress_pct,
        last_position_seconds=body.last_position_seconds,
        score=body.score,
        max_score=body.max_score,
    )

    module_just_completed = (
        row.get("status") == "completed"
        and row.get("completed_at") is not None
        and row.get("completed_at") == row.get("updated_at")
    )
    assignment = repo.get_assignment(access.assignment_id)
    training_just_completed = (
        assignment.get("status") == "completed"
        and assignment.get("completed_at") is not None
        and assignment.get("completed_at") == assignment.get("updated_at")
    )

    if module_just_completed and access.is_assignee:
        from app.services.learning_completion import on_module_completed
        on_module_completed(
            build_gamification_repository(),
            user_id=access.user_id,
            module_id=str(module_id),
            training_id=access.training_id,
            training_completed=training_just_completed,
            score=body.score,
            max_score=body.max_score,
        )

    return ModuleProgressResponse(**row)

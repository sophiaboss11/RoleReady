"""
Project CRUD endpoints with integrated pipeline trigger.

POST /projects/           – Create a project and kick off the background pipeline
GET  /projects/           – List projects for one organization
GET  /projects/{id}       – Get a single project
PUT  /projects/{id}       – Update a project
DELETE /projects/{id}     – Delete a project

POST /projects/{id}/documents       – Upload a single document
POST /projects/{id}/documents/bulk  – Upload multiple documents
GET  /projects/{id}/documents       – List documents for a project
"""

import logging
from typing import List, Literal

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.core.auth import (
    CurrentUser,
    OrganizationMemberAccess,
    ProjectAdminAccess,
    ProjectMemberAccess,
    authorize_organization_admin,
)
from app.core.config import get_settings
from app.repositories.factory import build_project_repository, build_training_repository
from app.schemas.project import (
    DocumentResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.schemas.training import TrainingCreateFromProject, TrainingResponse
from app.services.job_dispatch import enqueue_tracked_cloud_job, start_tracked_job
from app.services.pipeline_service import run_project_pipeline
from app.services.project.commands import (
    create_document_record,
    create_project_record,
    delete_project_record,
    ensure_project_org_immutable,
    update_project_record,
)
from app.services.project.queries import (
    get_project_record,
    list_document_records,
    list_project_asset_records,
    list_project_records,
)
from app.services.training.commands import create_training_from_project
from app.services.training.cover_jobs import schedule_training_cover_generation

logger = logging.getLogger(__name__)
router = APIRouter()


def _cleanup_orphan_project(project_id: str) -> None:
    """Best-effort removal of a project row whose pipeline failed to start."""
    repo = build_project_repository()
    try:
        delete_project_record(repo, project_id)
        logger.info("Cleaned up orphan project %s", project_id)
    except Exception:
        logger.exception("Failed to clean up orphan project %s, manual cleanup required", project_id)


@router.post("/", response_model=ProjectResponse)
async def create_project(
    project: ProjectCreate,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
):
    """
    Create a new project.

    After the row is persisted the automatic pipeline is triggered in the
    background (Data Ingestion → AI Content Generation). The API returns
    immediately with status ``created``.
    """
    org_id = str(project.organization_id)
    await authorize_organization_admin(user, org_id)

    project_repo = build_project_repository()
    project_row = create_project_record(
        project_repo,
        organization_id=org_id,
        title=project.title,
        description=project.description,
        github_link=project.github_link,
        jira_link=project.jira_link,
        confluence_link=project.confluence_link,
        repository_token=project.repository_token,
    )
    project_id = project_row["id"]

    try:
        settings = get_settings()
        if settings.use_cloud_tasks:
            pipeline_job = start_tracked_job(project_id, user.user_id, "project_pipeline")
            enqueue_tracked_cloud_job(
                job_id=pipeline_job["id"],
                job_type="project_pipeline",
                project_id=project_id,
            )
        else:
            background_tasks.add_task(run_project_pipeline, project_id)
    except Exception as exc:
        logger.exception(
            "Pipeline trigger failed for project %s, cleaning up orphan row",
            project_id,
        )
        _cleanup_orphan_project(project_id)
        raise HTTPException(
            status_code=500,
            detail="Project was created but the processing pipeline failed to start. Please try again.",
        ) from exc

    return ProjectResponse(**project_row)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(access: ProjectMemberAccess):
    return ProjectResponse(**get_project_record(build_project_repository(), access.project_id))


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    access: OrganizationMemberAccess,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    rows = list_project_records(
        build_project_repository(),
        organization_id=access.organization_id,
        limit=limit,
        offset=offset,
    )
    return [ProjectResponse(**project) for project in rows]


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project: ProjectUpdate, access: ProjectAdminAccess):
    ensure_project_org_immutable(project.organization_id)
    row = update_project_record(
        build_project_repository(),
        project_id=access.project_id,
        title=project.title,
        description=project.description,
        github_link=project.github_link,
        jira_link=project.jira_link,
        confluence_link=project.confluence_link,
        repository_token=project.repository_token,
    )
    return ProjectResponse(**row)


@router.delete("/{project_id}")
async def delete_project(access: ProjectAdminAccess):
    delete_project_record(build_project_repository(), access.project_id)
    return {"message": "Project deleted successfully"}


class ProjectAssetResponse(BaseModel):
    asset_type: str
    title: str
    available: bool
    preview: str | None = None
    visual_preview: str | None = None
    visual_preview_type: Literal["image", "mermaid"] | None = None


@router.get("/{project_id}/assets", response_model=List[ProjectAssetResponse])
async def list_project_assets(access: ProjectMemberAccess):
    return [
        ProjectAssetResponse(**asset)
        for asset in list_project_asset_records(build_project_repository(), access.project_id)
    ]


@router.post("/{project_id}/trainings", response_model=TrainingResponse)
async def create_project_training(
    project_id: str,
    body: TrainingCreateFromProject,
    background_tasks: BackgroundTasks,
    access: ProjectAdminAccess,
):
    if access.project_id != project_id:
        raise HTTPException(status_code=403, detail="Project access mismatch")

    training = create_training_from_project(
        build_training_repository(),
        project_id=access.project_id,
        organization_id=access.organization_id,
        created_by=access.user_id,
        title=body.title,
        description=body.description,
        due_date=body.due_date,
        asset_types=[asset_type for asset_type in body.asset_types],
        assignee_ids=[str(assignee_id) for assignee_id in body.assignee_ids],
        publish=body.publish,
    )
    schedule_training_cover_generation(
        background_tasks,
        project_id=access.project_id,
        training_id=training["id"],
        user_id=access.user_id,
    )
    return TrainingResponse(**training)


class FileUploadResponse(BaseModel):
    document_id: str
    filename: str
    content_type: str
    size: int
    project_id: str


@router.post("/{project_id}/documents", response_model=FileUploadResponse)
async def upload_document(
    access: ProjectAdminAccess,
    file: UploadFile = File(...),
):
    project_id = access.project_id
    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    row = create_document_record(
        build_project_repository(),
        project_id=project_id,
        filename=file.filename or "unknown",
        content_bytes=content,
        content_type=content_type,
    )
    return FileUploadResponse(
        document_id=row["id"],
        filename=row["filename"],
        content_type=content_type,
        size=len(content),
        project_id=project_id,
    )


@router.post("/{project_id}/documents/bulk", response_model=List[FileUploadResponse])
async def bulk_upload_documents(
    access: ProjectAdminAccess,
    files: List[UploadFile] = File(...),
):
    project_id = access.project_id
    results: list[FileUploadResponse] = []
    errors: list[str] = []

    for file in files:
        try:
            content = await file.read()
            content_type = file.content_type or "application/octet-stream"
            row = create_document_record(
                build_project_repository(),
                project_id=project_id,
                filename=file.filename or "unknown",
                content_bytes=content,
                content_type=content_type,
            )
            results.append(
                FileUploadResponse(
                    document_id=row["id"],
                    filename=row["filename"],
                    content_type=content_type,
                    size=len(content),
                    project_id=project_id,
                )
            )
        except Exception as exc:
            errors.append(f"Error uploading {file.filename}: {exc}")

    if errors and not results:
        raise HTTPException(status_code=500, detail=f"All uploads failed: {'; '.join(errors)}")

    return results


@router.get("/{project_id}/documents", response_model=List[DocumentResponse])
async def list_documents(
    access: ProjectMemberAccess,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    rows = list_document_records(
        build_project_repository(),
        project_id=access.project_id,
        limit=limit,
        offset=offset,
    )
    return [DocumentResponse(**doc) for doc in rows]

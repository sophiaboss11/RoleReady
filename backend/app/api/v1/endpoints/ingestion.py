from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from uuid import UUID

from app.core.auth import (
    CurrentUser,
    authorize_project_admin,
)
from app.core.config import get_settings
from app.services.data_ingestion.commands import (
    parse_confluence_space_key,
    parse_jira_project_key,
    validate_github_repo_url,
    validate_project_document_ids,
)
from app.services.job_dispatch import (
    enqueue_tracked_cloud_job,
    run_tracked_job,
    start_tracked_job,
)
from app.services.pipeline_steps import run_confluence_ingestion, run_document_ingestion, run_github_ingestion, run_jira_ingestion

router = APIRouter()


class GithubIngestionRequest(BaseModel):
    project_id: UUID
    repo_url: HttpUrl
    github_token: Optional[str] = None


class DocumentIngestionRequest(BaseModel):
    project_id: UUID
    document_ids: List[UUID]


def _run_github_ingestion(project_id: str, repo_url: str, job_id: str, github_token: Optional[str] = None) -> None:
    """Background wrapper for local mode job tracking."""
    run_tracked_job(
        job_id=job_id,
        job_type="github_ingestion",
        project_id=project_id,
        runner=lambda: run_github_ingestion(project_id, repo_url, github_token),
    )

def _run_jira_ingestion(project_id: str, jira_project_key: str, job_id: str) -> None:
    """Background wrapper for local mode job tracking."""
    run_tracked_job(
        job_id=job_id,
        job_type="jira_ingestion",
        project_id=project_id,
        runner=lambda: run_jira_ingestion(project_id, jira_project_key),
    )

def _run_confluence_ingestion(project_id: str, space_key: str, job_id: str) -> None:
    """Background wrapper for local mode job tracking."""
    run_tracked_job(
        job_id=job_id,
        job_type="confluence_ingestion",
        project_id=project_id,
        runner=lambda: run_confluence_ingestion(project_id, space_key),
    )


def _run_document_ingestion(project_id: str, document_ids: list[str], job_id: str) -> None:
    """Background wrapper for local mode job tracking."""
    run_tracked_job(
        job_id=job_id,
        job_type="document_ingestion",
        project_id=project_id,
        runner=lambda: run_document_ingestion(project_id, document_ids),
    )


class JiraIngestionRequest(BaseModel):
    project_id: UUID
    jira_url: HttpUrl

class ConfluenceIngestionRequest(BaseModel):
    project_id: UUID
    confluence_url: HttpUrl

@router.post("/github")
async def ingest_github_repo(
    request: GithubIngestionRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
):
    """Trigger GitHub ingestion in the background. Admin role required."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)
    validate_github_repo_url(str(request.repo_url))

    job = start_tracked_job(project_id_str, user.user_id, "github_ingestion")

    settings = get_settings()
    if settings.use_cloud_tasks:
        params = {"repo_url": str(request.repo_url)}
        if request.github_token:
            params["github_token"] = request.github_token

        enqueue_tracked_cloud_job(
            job_id=job["id"],
            job_type="github_ingestion",
            project_id=project_id_str,
            params=params,
        )
    else:
        background_tasks.add_task(
            _run_github_ingestion,
            project_id_str,
            str(request.repo_url),
            job["id"],
            request.github_token,
        )

    return {
        "message": "Ingestion started",
        "project_id": request.project_id,
        "repo_url": str(request.repo_url),
        "job_id": job["id"],
    }


@router.post("/jira")
async def ingest_jira_project(
    request: JiraIngestionRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
):
    """Trigger Jira ingestion in the background. Admin role required."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)
    jira_project_key = parse_jira_project_key(str(request.jira_url))

    job = start_tracked_job(project_id_str, user.user_id, "jira_ingestion")

    settings = get_settings()
    if settings.use_cloud_tasks:
        enqueue_tracked_cloud_job(
            job_id=job["id"],
            job_type="jira_ingestion",
            project_id=project_id_str,
            params={"jira_project_key": jira_project_key},
        )
    else:
        background_tasks.add_task(
            _run_jira_ingestion,
            project_id_str,
            jira_project_key,
            job["id"],
        )

    return {
        "message": "Jira ingestion started",
        "project_id": request.project_id,
        "jira_project_key": jira_project_key,
        "job_id": job["id"],
    }


@router.post("/confluence")
async def ingest_confluence_space(
    request: ConfluenceIngestionRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
):
    """Trigger Confluence ingestion in the background. Admin role required."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)
    space_key = parse_confluence_space_key(str(request.confluence_url))

    job = start_tracked_job(project_id_str, user.user_id, "confluence_ingestion")

    settings = get_settings()
    if settings.use_cloud_tasks:
        enqueue_tracked_cloud_job(
            job_id=job["id"],
            job_type="confluence_ingestion",
            project_id=project_id_str,
            params={"space_key": space_key},
        )
    else:
        background_tasks.add_task(
            _run_confluence_ingestion,
            project_id_str,
            space_key,
            job["id"],
        )

    return {
        "message": "Confluence ingestion started",
        "project_id": request.project_id,
        "space_key": space_key,
        "job_id": job["id"],
    }


@router.post("/documents")
async def ingest_documents(
    request: DocumentIngestionRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
):
    """Trigger ingestion for specific documents in the background. Admin role required."""
    project_id_str = str(request.project_id)
    await authorize_project_admin(user, project_id_str)

    doc_ids_str = [str(uid) for uid in request.document_ids]
    validate_project_document_ids(project_id_str, doc_ids_str)
    job = start_tracked_job(project_id_str, user.user_id, "document_ingestion")

    settings = get_settings()
    if settings.use_cloud_tasks:
        enqueue_tracked_cloud_job(
            job_id=job["id"],
            job_type="document_ingestion",
            project_id=project_id_str,
            params={"document_ids": doc_ids_str},
        )
    else:
        background_tasks.add_task(
            _run_document_ingestion,
            project_id_str,
            doc_ids_str,
            job["id"],
        )

    return {
        "message": "Document ingestion started",
        "project_id": request.project_id,
        "document_count": len(request.document_ids),
        "job_id": job["id"],
    }

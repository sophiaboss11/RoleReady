from fastapi import APIRouter, Query
from typing import Optional

from app.core.auth import (
    ProjectMemberAccess,
)
from app.models.job import JobType
from app.services.job_tracker import get_jobs_for_project

router = APIRouter()


@router.get("/{project_id}")
async def list_jobs(
    access: ProjectMemberAccess,
    job_type: Optional[JobType] = Query(None),
):
    """List jobs for a project. Requires organization membership."""
    jobs = get_jobs_for_project(access.project_id, job_type=job_type)
    return jobs

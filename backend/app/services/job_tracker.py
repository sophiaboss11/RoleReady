import logging
from typing import Optional

from app.core.exceptions import InfraError
from app.models.job import JobType, JobStatus
from app.repositories.factory import build_job_repository

logger = logging.getLogger(__name__)


def create_job(project_id: str, user_id: str, job_type: JobType) -> dict:
    """Insert a new job row with status='pending'. Returns the created row."""
    try:
        return build_job_repository().create_job(project_id, user_id, job_type)
    except InfraError as exc:
        logger.error("Failed to create job for project %s: %s", project_id, exc)
        raise


def update_job_status(
    job_id: str,
    status: JobStatus,
    error_message: Optional[str] = None,
) -> None:
    """Update a job's status and optionally set an error message."""
    try:
        build_job_repository().update_job_status(
            job_id=job_id,
            status=status,
            error_message=error_message,
        )
    except InfraError as exc:
        logger.error("Failed to update job %s to status '%s': %s", job_id, status, exc)


def get_jobs_for_project(
    project_id: str,
    job_type: Optional[JobType] = None,
) -> list[dict]:
    """Fetch jobs for a project, optionally filtered by job_type. Most recent first."""
    return build_job_repository().list_jobs_for_project(
        project_id=project_id,
        job_type=job_type,
    )

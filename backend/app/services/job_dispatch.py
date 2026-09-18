from __future__ import annotations

from typing import Any, Callable, TypeVar

from app.core.exceptions import ExternalServiceError
from app.models.job import JobType
from app.services.job_execution import run_job_with_status
from app.services.job_tracker import create_job, update_job_status

T = TypeVar("T")


def start_tracked_job(project_id: str, user_id: str, job_type: JobType) -> dict[str, Any]:
    return create_job(project_id, user_id, job_type)


def enqueue_tracked_cloud_job(
    *,
    job_id: str,
    job_type: JobType,
    project_id: str,
    params: dict[str, Any] | None = None,
) -> None:
    from app.core.cloud_tasks import enqueue_job

    try:
        enqueue_job(
            job_id=job_id,
            job_type=job_type,
            project_id=project_id,
            params=params,
        )
    except Exception as exc:
        update_job_status(job_id, "failed", error_message=str(exc))
        raise ExternalServiceError(f"Failed to enqueue job '{job_type}'") from exc


def run_tracked_job(
    *,
    job_id: str,
    job_type: JobType,
    project_id: str,
    runner: Callable[[], T],
) -> T:
    return run_job_with_status(
        job_id=job_id,
        job_type=job_type,
        project_id=project_id,
        runner=runner,
    )

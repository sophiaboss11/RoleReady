"""Shared helper for tracked job execution."""

from __future__ import annotations

import logging
from typing import Callable, TypeVar

from app.services.job_tracker import update_job_status

logger = logging.getLogger(__name__)

T = TypeVar("T")


def run_job_with_status(
    *,
    job_id: str,
    job_type: str,
    project_id: str,
    runner: Callable[[], T],
) -> T:
    """Run a job step with unified status tracking and error handling."""
    update_job_status(job_id, "running")
    try:
        result = runner()
        update_job_status(job_id, "completed")
        return result
    except Exception as exc:
        logger.exception("Job %s (type=%s) failed for project %s", job_id, job_type, project_id)
        update_job_status(job_id, "failed", error_message=str(exc))
        raise

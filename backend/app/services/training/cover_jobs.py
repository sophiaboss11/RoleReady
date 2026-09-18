from __future__ import annotations

import logging

from fastapi import BackgroundTasks

from app.core.config import get_settings
from app.repositories.factory import build_training_repository
from app.services.job_dispatch import enqueue_tracked_cloud_job, run_tracked_job, start_tracked_job
from app.services.training.cover_generation import (
    mark_training_cover_failed,
    run_training_cover_generation,
)

logger = logging.getLogger(__name__)


def schedule_training_cover_generation(
    background_tasks: BackgroundTasks,
    *,
    project_id: str,
    training_id: str,
    user_id: str,
) -> None:
    try:
        job = start_tracked_job(project_id, user_id, "training_cover_generation")
        job_id = job["id"]

        if get_settings().use_cloud_tasks:
            enqueue_tracked_cloud_job(
                job_id=job_id,
                job_type="training_cover_generation",
                project_id=project_id,
                params={"training_id": training_id},
            )
            return

        background_tasks.add_task(
            run_training_cover_job,
            job_id=job_id,
            project_id=project_id,
            training_id=training_id,
        )
    except Exception as exc:
        logger.exception("Failed to schedule training cover generation for %s", training_id)
        mark_training_cover_failed(build_training_repository(), training_id, str(exc))


def run_training_cover_job(*, job_id: str, project_id: str, training_id: str) -> None:
    run_tracked_job(
        job_id=job_id,
        job_type="training_cover_generation",
        project_id=project_id,
        runner=lambda: run_training_cover_generation(training_id),
    )

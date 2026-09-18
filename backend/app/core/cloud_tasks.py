"""
Cloud Tasks client – Enqueue jobs for the Worker Cloud Run service.

Uses OIDC authentication so that Cloud Tasks can invoke the private Worker
endpoint with the correct identity token.
"""

import json
import logging
from functools import lru_cache
from typing import Any

from google.cloud import tasks_v2

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_client() -> tasks_v2.CloudTasksClient:
    return tasks_v2.CloudTasksClient()


def enqueue_job(
    job_id: str,
    job_type: str,
    project_id: str,
    params: dict[str, Any] | None = None,
) -> str:
    """
    Create a Cloud Task that POSTs to the Worker's ``/tasks/execute`` endpoint.

    Returns the Cloud Tasks task name.
    """
    settings = get_settings()

    client = _get_client()
    parent = client.queue_path(
        settings.gcp_project_id,
        settings.gcp_region,
        settings.cloud_tasks_queue,
    )

    body = {
        "job_id": job_id,
        "job_type": job_type,
        "project_id": project_id,
        "params": params or {},
    }

    task: dict[str, Any] = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{settings.worker_url.rstrip('/')}/tasks/execute",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(body).encode(),
            "oidc_token": {
                "service_account_email": settings.cloud_tasks_service_account,
                "audience": settings.worker_url,
            },
        },
    }

    response = client.create_task(
        request={"parent": parent, "task": task},
    )
    logger.info(
        "Enqueued Cloud Task %s for job %s (type=%s, project=%s)",
        response.name,
        job_id,
        job_type,
        project_id,
    )
    return response.name

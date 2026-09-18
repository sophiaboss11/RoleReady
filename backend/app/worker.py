"""
Worker FastAPI app – Receives tasks from Cloud Tasks and dispatches them.

Deployed as a separate Cloud Run service using the same Docker image but
with a different entrypoint:
    uvicorn app.worker:app --host 0.0.0.0 --port 8000

The ``--no-allow-unauthenticated`` flag on Cloud Run ensures only the
Cloud Tasks service account (via OIDC) can invoke this service.
"""

import logging

from fastapi import FastAPI
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.services.worker_dispatch import dispatch_job

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Role-Ready Worker")


class TaskPayload(BaseModel):
    job_id: str
    job_type: str
    project_id: str
    params: dict[str, object] = Field(default_factory=dict)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/tasks/execute")
async def execute_task(payload: TaskPayload) -> dict[str, str]:
    """
    Entry point for Cloud Tasks.

    Cloud Tasks expects a 2xx response to consider the task successful.
    A non-2xx response triggers a retry according to the queue config.
    """
    logger.info(
        "Received task: job_id=%s job_type=%s project_id=%s",
        payload.job_id,
        payload.job_type,
        payload.project_id,
    )

    await run_in_threadpool(
        dispatch_job,
        job_id=payload.job_id,
        job_type=payload.job_type,
        project_id=payload.project_id,
        params=payload.params,
    )

    return {"status": "completed", "job_id": payload.job_id}

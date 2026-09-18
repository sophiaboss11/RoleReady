"""Worker Dispatch – Route Cloud Tasks jobs to shared pipeline steps."""

import logging

from app.services.job_execution import run_job_with_status
from app.services.pipeline_service import run_project_pipeline
from app.services.pipeline_steps import (
    run_confluence_ingestion,
    run_document_ingestion,
    run_github_ingestion,
    run_infographic_generation,
    run_jira_ingestion,
    run_mindmap_generation,
    run_tts_generation,
    run_video_generation,
)
from app.services.project_status_service import get_project_status, update_project_status
from app.services.training.cover_generation import run_training_cover_generation

logger = logging.getLogger(__name__)


def _as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _optional_str_param(params: dict[str, object], key: str) -> str | None:
    value = params.get(key)
    if value is None:
        return None
    if isinstance(value, str):
        return value
    raise ValueError(f"{key} must be a string")


def _required_str_param(params: dict[str, object], key: str) -> str:
    value = _optional_str_param(params, key)
    if not value:
        raise ValueError(f"{key} is required")
    return value


def _optional_str_list_param(params: dict[str, object], key: str) -> list[str] | None:
    value = params.get(key)
    if value is None:
        return None
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"{key} must be a list of strings")
    return value


def _int_param(params: dict[str, object], key: str, default: int) -> int:
    value = params.get(key, default)
    if isinstance(value, bool):
        raise ValueError(f"{key} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value)
    raise ValueError(f"{key} must be an integer")


def dispatch_job(
    job_id: str,
    job_type: str,
    project_id: str,
    params: dict[str, object],
) -> None:
    def run() -> None:
        if job_type == "project_pipeline":
            logger.info("Running full project pipeline in worker for project %s", project_id)
            result = run_project_pipeline(project_id)
            if result == "no_data_sources":
                logger.info(
                    "Project pipeline skipped in worker because no data sources are configured "
                    "for project %s",
                    project_id,
                )
                return
            final_status = get_project_status(project_id)
            if final_status != "completed":
                if final_status != "failed":
                    update_project_status(project_id, "failed")
                raise RuntimeError(
                    "Project pipeline did not complete successfully "
                    f"(project_id={project_id}, final_status={final_status})"
                )
            return

        if job_type == "github_ingestion":
            run_github_ingestion(
                project_id,
                _required_str_param(params, "repo_url"),
                _optional_str_param(params, "github_token"),
            )
            return
        if job_type == "jira_ingestion":
            run_jira_ingestion(project_id, _required_str_param(params, "jira_project_key"))
            return
        if job_type == "confluence_ingestion":
            run_confluence_ingestion(project_id, _required_str_param(params, "space_key"))
            return
        if job_type == "document_ingestion":
            document_ids = _optional_str_list_param(params, "document_ids")
            run_document_ingestion(project_id, document_ids=document_ids)
            return
        if job_type == "infographic_generation":
            run_infographic_generation(project_id)
            return
        if job_type == "mindmap_generation":
            run_mindmap_generation(
                project_id,
                query=_optional_str_param(params, "query") or "project overview",
                max_docs=_int_param(params, "max_docs", 6),
                require_context=_as_bool(params.get("require_context", True)),
            )
            return
        if job_type == "tts_generation":
            run_tts_generation(
                project_id,
                voice=_optional_str_param(params, "voice") or "alloy",
                model=_optional_str_param(params, "model") or "tts-1",
                fmt=_optional_str_param(params, "format") or "mp3",
            )
            return
        if job_type == "video_generation":
            run_video_generation(
                project_id,
                prompt=_optional_str_param(params, "prompt") or "",
                max_docs=_int_param(params, "max_docs", 6),
                require_context=_as_bool(params.get("require_context", True)),
                max_slides=_int_param(params, "max_slides", 8),
                voice=_optional_str_param(params, "voice") or "alloy",
                model=_optional_str_param(params, "model") or "tts-1",
                fmt=_optional_str_param(params, "format") or "mp3",
            )
            return
        if job_type == "training_cover_generation":
            run_training_cover_generation(_required_str_param(params, "training_id"))
            return

        raise ValueError(f"Unknown job_type: {job_type}")

    run_job_with_status(
        job_id=job_id,
        job_type=job_type,
        project_id=project_id,
        runner=run,
    )

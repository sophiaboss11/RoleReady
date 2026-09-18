"""
Pipeline Service – Orchestrates the automated flow:

    Create Project
        → Data Ingestion (GitHub / Documents)
            → AI Content Generation (summarization → infographic / mindmap / audio / video)

All steps run in the background and communicate exclusively via ``project_id``.
The project's ``status`` column is updated at every stage so the frontend can
poll for progress.
"""

import logging
import re
from typing import Literal, Optional

from app.core.exceptions import NotFoundError
from app.services.content_generation.summarization import summarize_embeddings
from app.services.pipeline_steps import (
    run_architecture_generation,
    run_confluence_ingestion,
    run_document_ingestion,
    run_github_ingestion,
    run_jira_ingestion,
    run_infographic_generation,
    run_mindmap_generation,
    run_pinpoint_generation,
    run_tts_generation,
    run_video_generation,
)
from app.services.project_status_service import (
    get_project,
    project_has_documents,
    update_project_status,
)

logger = logging.getLogger(__name__)

ProjectPipelineResult = Literal["completed", "failed", "no_data_sources", "not_found"]


# ---------------------------------------------------------------------------
# Data‑ingestion step
# ---------------------------------------------------------------------------

def _extract_jira_key(url: str) -> str | None:
    match = re.search(r"/(?:projects|browse)/([^/?#-]+)", url)
    if match: return match.group(1)
    return None

def _extract_confluence_space(url: str) -> str | None:
    match = re.search(r"/spaces/([^/?#]+)", url)
    if match: return match.group(1)
    return None

def _run_ingestion(project_id: str, project: dict, github_link_override: Optional[str] = None) -> bool:
    """
    Run all applicable data‑ingestion steps for a project.

    Returns ``True`` when at least one ingestion source succeeded.
    """
    success = False

    github_link = github_link_override if github_link_override is not None else project.get("github_link")
    github_token = project.get("repository_token")

    # 1. GitHub ingestion
    if github_link:
        try:
            logger.info("Starting GitHub ingestion for project %s …", project_id)
            run_github_ingestion(project_id, github_link, github_token)
            success = True
            logger.info("GitHub ingestion completed for project %s", project_id)
        except NotFoundError:
            raise
        except Exception as exc:
            logger.error("GitHub ingestion failed for project %s: %s", project_id, exc)

    # 2. Jira ingestion
    if project.get("jira_link"):
        try:
            logger.info("Starting Jira ingestion for project %s …", project_id)
            jira_key = _extract_jira_key(project["jira_link"])
            if jira_key:
                run_jira_ingestion(project_id, jira_key)
                success = True
                logger.info("Jira ingestion completed for project %s", project_id)
            else:
                logger.warning("Could not extract Jira project key from %s", project["jira_link"])
        except NotFoundError:
            raise
        except Exception as exc:
            logger.error("Jira ingestion failed for project %s: %s", project_id, exc)

    # 3. Confluence ingestion
    if project.get("confluence_link"):
        try:
            logger.info("Starting Confluence ingestion for project %s …", project_id)
            space_key = _extract_confluence_space(project["confluence_link"])
            if space_key:
                run_confluence_ingestion(project_id, space_key)
                success = True
                logger.info("Confluence ingestion completed for project %s", project_id)
            else:
                logger.warning("Could not extract Confluence space key from %s", project["confluence_link"])
        except NotFoundError:
            raise
        except Exception as exc:
            logger.error("Confluence ingestion failed for project %s: %s", project_id, exc)

    # 4. Document ingestion (process any uploaded documents)
    try:
        logger.info("Starting document ingestion for project %s …", project_id)
        inserted = run_document_ingestion(project_id)
        if inserted and inserted > 0:
            success = True
            logger.info("Document ingestion completed for project %s (%d embeddings)", project_id, inserted)
        else:
            logger.info("No documents to ingest for project %s", project_id)
    except NotFoundError:
        raise
    except Exception as exc:
        logger.error("Document ingestion failed for project %s: %s", project_id, exc)

    return success


# ---------------------------------------------------------------------------
# AI content‑generation step
# ---------------------------------------------------------------------------

def _run_ai_generation(project_id: str) -> bool:
    """
    Trigger all AI content‑generation services for a project.

    Each service reads the project summary (or embeddings) by itself –
    we only pass ``project_id``.

    Returns ``True`` only when all expected assets were generated successfully.
    """
    summary_ok = False
    infographic_ok = False
    mindmap_ok = False
    pinpoint_ok = False
    architecture_ok = False
    audio_ok = False
    video_ok = False

    # 1. Summarization – must run first because other services depend on it
    try:
        logger.info("Generating summary for project %s …", project_id)
        summary_result = summarize_embeddings(project_id=project_id)
        summary_ok = bool(summary_result.get("saved_to_db"))
        if not summary_ok:
            raise RuntimeError("Summary generation finished but was not persisted")
        logger.info("Summary generated for project %s", project_id)
    except Exception as exc:
        logger.error("Summarization failed for project %s: %s", project_id, exc)

    # 2. Infographic generation
    try:
        logger.info("Generating infographic for project %s …", project_id)
        run_infographic_generation(project_id)
        infographic_ok = True
        logger.info("Infographic generated and saved for project %s", project_id)
    except Exception as exc:
        logger.error("Infographic generation failed for project %s: %s", project_id, exc)

    # 3. Mindmap generation
    try:
        logger.info("Generating mindmap for project %s …", project_id)
        project = get_project(project_id)
        query = (project or {}).get("title", "project overview")
        run_mindmap_generation(
            project_id,
            query=query,
            require_context=False,
        )
        mindmap_ok = True
        logger.info("Mindmap generated and saved for project %s", project_id)
    except Exception as exc:
        logger.error("Mindmap generation failed for project %s: %s", project_id, exc)

    # 4. Pinpoint generation
    try:
        logger.info("Generating pinpoint clues for project %s …", project_id)
        run_pinpoint_generation(project_id, question_count=10)
        pinpoint_ok = True
        logger.info("Pinpoint clues generated and saved for project %s", project_id)
    except Exception as exc:
        logger.error("Pinpoint generation failed for project %s: %s", project_id, exc)

    # 5. Architecture generation
    try:
        logger.info("Generating architecture buckets for project %s …", project_id)
        run_architecture_generation(project_id)
        architecture_ok = True
        logger.info("Architecture generated and saved for project %s", project_id)
    except Exception as exc:
        logger.error("Architecture generation failed for project %s: %s", project_id, exc)

    # 6. Audio generation (TTS) – requires summary
    if summary_ok:
        try:
            logger.info("Generating TTS audio for project %s …", project_id)
            run_tts_generation(project_id)
            audio_ok = True
            logger.info("TTS audio generated and saved for project %s", project_id)
        except Exception as exc:
            logger.error("Audio generation failed for project %s: %s", project_id, exc)

    # Video generation is removed from the automatic pipeline because it takes ~10-15 mins
    # and blocks pipeline completion. It should be triggered via its standalone API.
    video_ok = False

    all_ok = (
        summary_ok
        and infographic_ok
        and mindmap_ok
        and pinpoint_ok
        and architecture_ok
        and audio_ok
    )
    any_ok = any([summary_ok, infographic_ok, mindmap_ok, pinpoint_ok, architecture_ok, audio_ok])

    logger.info(
        "AI generation results for project %s: summary=%s infographic=%s mindmap=%s "
        "pinpoint=%s architecture=%s audio=%s",
        project_id, summary_ok, infographic_ok, mindmap_ok,
        pinpoint_ok, architecture_ok, audio_ok
    )

    return all_ok, any_ok


# ---------------------------------------------------------------------------
# Public entry point – called from the project endpoint as a background task
# ---------------------------------------------------------------------------

def _has_data_sources(project: dict, github_link_override: Optional[str] = None) -> bool:
    """Return True when the project has at least one data source to ingest."""
    github_link = github_link_override if github_link_override is not None else project.get("github_link")
    if github_link or project.get("jira_link") or project.get("confluence_link"):
        return True

    return project_has_documents(project["id"])


def run_project_pipeline(
    project_id: str,
    github_link_override: Optional[str] = None,
) -> ProjectPipelineResult:
    """
    Full background pipeline executed after a project is created.

    The pipeline only runs when the project has at least one data source
    (GitHub link or uploaded documents).  If nothing is configured the
    project stays in ``created`` status so the user can add resources
    and trigger the pipeline later.

    Args:
        project_id: Target project ID.
        github_link_override: Optional immutable repo URL from queued job payload.
            When provided, this value is used for GitHub ingestion instead of
            re-reading ``project.github_link`` from the database.

    Status transitions:
        created → ingesting → ingestion_completed → generating_assets → completed
                                                                       ↘ failed
                            ↘ failed (ingestion)
    """
    logger.info("=== Pipeline started for project %s ===", project_id)

    try:
        project = get_project(project_id)
    except NotFoundError:
        logger.error("Pipeline aborted – project %s not found", project_id)
        return "not_found"

    # ── Guard: only proceed when there is something to ingest ──────────
    try:
        has_data_sources = _has_data_sources(project, github_link_override=github_link_override)
    except Exception:
        logger.exception(
            "Failed to evaluate data sources for project %s. Marking pipeline as failed.",
            project_id,
        )
        update_project_status(project_id, "failed")
        return "failed"

    if not has_data_sources:
        logger.info(
            "No data sources configured for project %s – "
            "pipeline will not run. Project stays in 'created' status.",
            project_id,
        )
        return "no_data_sources"

    # ── Step 1: Data Ingestion ──────────────────────────────────────────
    update_project_status(project_id, "ingesting")

    ingestion_ok = _run_ingestion(project_id, project, github_link_override)

    if not ingestion_ok:
        logger.warning("All ingestion sources failed for project %s – marking failed", project_id)
        update_project_status(project_id, "failed")
        return "failed"

    update_project_status(project_id, "ingestion_completed")

    # ── Step 2: AI Content Generation ───────────────────────────────────
    update_project_status(project_id, "generating_assets")

    all_ok, any_ok = _run_ai_generation(project_id)

    if all_ok:
        update_project_status(project_id, "completed")
        logger.info("=== Pipeline completed for project %s ===", project_id)
        return "completed"
    elif any_ok:
        update_project_status(project_id, "completed")
        logger.warning("=== Pipeline completed with partial errors for project %s ===", project_id)
        return "completed"
    else:
        update_project_status(project_id, "failed")
        logger.warning("=== Pipeline failed (AI generation) for project %s ===", project_id)
        return "failed"

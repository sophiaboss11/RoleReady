import logging
from datetime import datetime
from typing import Optional, Tuple

from app.repositories.factory import build_content_repository, build_project_repository

logger = logging.getLogger(__name__)


def update_project_status(project_id: str, status: str) -> None:
    """Persist a new status value on the project row."""
    build_project_repository().update_project_status(
        project_id,
        {
            "status": status,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )
    logger.info("Project %s status -> %s", project_id, status)


def get_project_status(project_id: str) -> Optional[str]:
    """Read the current project status."""
    return build_project_repository().get_project_status(project_id)


def get_project(project_id: str) -> dict:
    """Fetch the full project row."""
    return build_project_repository().get_project(project_id)


def project_has_documents(project_id: str) -> bool:
    """Return True when at least one uploaded document exists for a project."""
    return build_project_repository().project_has_documents(project_id)


def _has_processed_infographic(project_id: str) -> bool:
    """Return True when an infographic row exists and is marked processed."""
    return build_content_repository().is_processed_asset_ready("project_infographic", project_id)


def _has_processed_mindmap(project_id: str) -> bool:
    """Return True when a mindmap row exists and is marked processed."""
    return build_content_repository().is_processed_asset_ready("project_mindmap", project_id)


def _has_processed_audio(project_id: str) -> bool:
    """Return True when an audio row exists and is marked processed."""
    return build_content_repository().is_processed_asset_ready("project_audio", project_id)


def get_generation_asset_readiness(project_id: str) -> Tuple[bool, bool, bool]:
    """Return (has_infographic, has_mindmap, has_audio) for a project."""
    return (
        _has_processed_infographic(project_id),
        _has_processed_mindmap(project_id),
        _has_processed_audio(project_id),
    )


def promote_failed_project_if_assets_ready(project_id: str) -> bool:
    """
    Promote project status failed -> completed when required generation assets are ready.

    This is used after manual asset regeneration so the UI can recover from an older
    failed pipeline status once infographic and mindmap are both available.
    """
    current_status = get_project_status(project_id)
    if current_status != "failed":
        return False

    has_infographic, has_mindmap, has_audio = get_generation_asset_readiness(project_id)
    if not (has_infographic and has_mindmap and has_audio):
        logger.info(
            "Project %s remains failed (infographic_ready=%s, mindmap_ready=%s, audio_ready=%s)",
            project_id,
            has_infographic,
            has_mindmap,
            has_audio,
        )
        return False

    update_project_status(project_id, "completed")
    logger.info("Project %s promoted failed -> completed after manual regeneration", project_id)
    return True

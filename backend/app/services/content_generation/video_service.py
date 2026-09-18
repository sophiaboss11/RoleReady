from __future__ import annotations

from typing import Any

from app.repositories.factory import build_content_repository
from app.services.content_generation.asset_persistence import upsert_project_asset
from app.services.content_generation.queries import get_project_asset_record
from app.services.project_status_service import promote_failed_project_if_assets_ready


def get_video_for_project(project_id: str) -> dict[str, Any]:
    """Fetch the latest video record for a project."""
    return get_project_asset_record(
        build_content_repository(),
        table_name="project_video",
        project_id=project_id,
    )


def upsert_video(
    *,
    project_id: str,
    video_url: str | None,
    prompt: str,
    retrieved_count: int,
    slide_count: int,
    warning: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    saved = upsert_project_asset(
        "project_video",
        {
            "project_id": project_id,
            "video_url": video_url,
            "prompt": prompt,
            "retrieved_count": int(retrieved_count),
            "slide_count": int(slide_count),
            "warning": warning,
            "metadata": metadata or {},
            "is_processed": True,
        },
    )
    promote_failed_project_if_assets_ready(project_id)
    return saved

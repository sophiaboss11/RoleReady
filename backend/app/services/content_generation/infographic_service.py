import logging
from typing import Dict, Optional

from app.repositories.factory import build_content_repository
from app.services.content_generation.asset_persistence import upsert_project_asset
from app.services.content_generation.queries import get_project_infographic_record
from app.services.project_status_service import promote_failed_project_if_assets_ready

logger = logging.getLogger(__name__)


def get_infographic_for_project(project_id: str) -> Dict:
    """Fetch the latest infographic record for a project."""
    return get_project_infographic_record(build_content_repository(), project_id)


def upsert_infographic(
    project_id: str,
    image_url: Optional[str],
    infographic_text: Optional[str] = None,
) -> Dict:
    """Upsert one infographic row per project."""
    saved = upsert_project_asset("project_infographic", {
        "project_id": project_id,
        "image_url": image_url,
        "infographic_text": infographic_text,
        "is_processed": True,
    })
    promote_failed_project_if_assets_ready(project_id)

    return saved

from typing import Any, Dict, Optional

from app.repositories.factory import build_content_repository
from app.services.content_generation.asset_persistence import upsert_project_asset
from app.services.content_generation.queries import get_project_mindmap_record
from app.services.project_status_service import promote_failed_project_if_assets_ready


def get_mindmap_for_project(project_id: str) -> Dict[str, Any]:
    """Fetch the latest mindmap record for a project."""
    return get_project_mindmap_record(build_content_repository(), project_id)


def upsert_mindmap(
    project_id: str,
    mermaid: str,
    retrieved_count: int,
    warning: Optional[str],
    sources: list[dict[str, Any]],
) -> Dict[str, Any]:
    """Upsert one mindmap row per project."""
    saved = upsert_project_asset("project_mindmap", {
        "project_id": project_id,
        "mermaid": mermaid,
        "retrieved_count": retrieved_count,
        "warning": warning,
        "sources": sources,
        "is_processed": True,
    })
    promote_failed_project_if_assets_ready(project_id)

    return saved

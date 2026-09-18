from __future__ import annotations

from app.repositories.content_repository import ContentRepository


def get_project_summary_record(
    repo: ContentRepository,
    project_id: str,
) -> dict[str, object]:
    return repo.get_project_asset("project_summary", project_id)


def get_project_asset_record(
    repo: ContentRepository,
    *,
    table_name: str,
    project_id: str,
) -> dict[str, object]:
    return repo.get_project_asset(table_name, project_id)


def get_project_infographic_record(
    repo: ContentRepository,
    project_id: str,
) -> dict[str, object]:
    return repo.get_project_asset("project_infographic", project_id)


def get_project_mindmap_record(
    repo: ContentRepository,
    project_id: str,
) -> dict[str, object]:
    return repo.get_project_asset("project_mindmap", project_id)


def get_project_audio_record(
    repo: ContentRepository,
    project_id: str,
) -> dict[str, object]:
    return repo.get_project_asset("project_audio", project_id)


def list_project_embedding_rows(
    repo: ContentRepository,
    project_id: str,
    *,
    columns: str,
    page_size: int,
) -> list[dict[str, object]]:
    return repo.list_project_embedding_rows(
        project_id,
        columns=columns,
        page_size=page_size,
    )

from app.repositories.project_repository import ProjectRepository
from app.repositories.types import DocumentRow, ProjectRow


def get_project_record(repo: ProjectRepository, project_id: str) -> ProjectRow:
    return repo.get_project(project_id)


def list_project_records(
    repo: ProjectRepository,
    *,
    organization_id: str,
    limit: int,
    offset: int,
) -> list[ProjectRow]:
    return repo.list_projects(
        organization_id=organization_id,
        limit=limit,
        offset=offset,
    )


def list_document_records(
    repo: ProjectRepository,
    *,
    project_id: str,
    limit: int,
    offset: int,
) -> list[DocumentRow]:
    return repo.list_documents(
        project_id=project_id,
        limit=limit,
        offset=offset,
    )


def list_project_asset_records(repo: ProjectRepository, project_id: str) -> list[dict[str, object]]:
    return repo.list_project_assets(project_id)

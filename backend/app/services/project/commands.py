import base64
import uuid
from datetime import datetime

from app.core.exceptions import ValidationError
from app.repositories.project_repository import ProjectRepository
from app.repositories.types import DocumentRow, ProjectRow


def create_project_record(
    repo: ProjectRepository,
    *,
    organization_id: str,
    title: str,
    description: str,
    github_link: str | None,
    jira_link: str | None,
    confluence_link: str | None,
    repository_token: str | None = None,
) -> ProjectRow:
    now = datetime.utcnow().isoformat()
    project_data: ProjectRow = {
        "id": str(uuid.uuid4()),
        "title": title,
        "description": description,
        "organization_id": organization_id,
        "github_link": github_link,
        "jira_link": jira_link,
        "confluence_link": confluence_link,
        "repository_token": repository_token,
        "status": "created",
        "created_at": now,
        "updated_at": now,
    }
    return repo.create_project(project_data)


def update_project_record(
    repo: ProjectRepository,
    *,
    project_id: str,
    title: str | None,
    description: str | None,
    github_link: str | None,
    jira_link: str | None,
    confluence_link: str | None,
    repository_token: str | None = None,
) -> ProjectRow:
    update_data: dict[str, object] = {}
    if title is not None:
        update_data["title"] = title
    if description is not None:
        update_data["description"] = description
    if github_link is not None:
        update_data["github_link"] = github_link
    if jira_link is not None:
        update_data["jira_link"] = jira_link
    if confluence_link is not None:
        update_data["confluence_link"] = confluence_link
    if repository_token is not None:
        update_data["repository_token"] = repository_token

    if not update_data:
        raise ValidationError("No updatable fields provided")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    return repo.update_project(project_id, update_data)


def delete_project_record(repo: ProjectRepository, project_id: str) -> None:
    repo.delete_project(project_id)


def create_document_record(
    repo: ProjectRepository,
    *,
    project_id: str,
    filename: str,
    content_bytes: bytes,
    content_type: str,
) -> DocumentRow:
    is_text = content_type.startswith("text/")
    content = (
        content_bytes.decode("utf-8", errors="replace")
        if is_text
        else base64.b64encode(content_bytes).decode("utf-8")
    )

    now = datetime.utcnow().isoformat()
    document_data: DocumentRow = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "filename": filename or "unknown",
        "content": content,
        "chunk_index": 0,
        "metadata": {
            "content_type": content_type,
            "size": len(content_bytes),
            "encoding": "utf-8" if is_text else "base64",
        },
        "processed": False,
        "created_at": now,
        "updated_at": now,
    }
    return repo.create_document(document_data)


def ensure_project_org_immutable(organization_id: object) -> None:
    if organization_id is not None:
        raise ValidationError("organization_id cannot be updated")

from __future__ import annotations

import re
from urllib.parse import urlparse

from app.core.exceptions import ValidationError
from app.repositories.factory import build_document_repository

ALLOWED_GITHUB_HOSTS = {"github.com", "www.github.com"}


def validate_github_repo_url(repo_url: str) -> None:
    parsed = urlparse(repo_url)
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_GITHUB_HOSTS:
        raise ValidationError("Only github.com repository URLs are allowed")


def parse_jira_project_key(jira_url: str) -> str:
    match = re.search(r"/projects/([^/]+)", jira_url)
    if not match:
        match = re.search(r"projectKey=([^&]+)", jira_url)
    if not match:
        raise ValidationError(
            "Could not parse Jira project key from the provided URL. Expected /projects/KEY format."
        )
    return match.group(1).upper()


def parse_confluence_space_key(confluence_url: str) -> str:
    match = re.search(r"/spaces/([^/]+)", confluence_url)
    if not match:
        raise ValidationError(
            "Could not parse Confluence space key from the provided URL. Expected /spaces/KEY format."
        )
    return match.group(1).upper()


def validate_project_document_ids(project_id: str, document_ids: list[str]) -> None:
    if not document_ids:
        raise ValidationError("document_ids must not be empty")

    document_repo = build_document_repository()
    matched_ids = {
        row["id"]
        for row in document_repo.list_documents(
            project_id=project_id,
            document_ids=document_ids,
            limit=len(document_ids),
            ignore_processed=True,
        )
    }
    requested_ids = set(document_ids)
    missing_ids = requested_ids - matched_ids
    if missing_ids:
        raise ValidationError("Some document_ids do not belong to the specified project_id")

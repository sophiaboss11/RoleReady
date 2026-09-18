"""Shared persistence helpers for single-row project assets."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import ValidationError
from app.repositories.factory import build_content_repository


def upsert_project_asset(table_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Upsert a per-project asset row using project_id as the conflict key."""
    if not payload.get("project_id"):
        raise ValidationError("project_id is required in asset payload")

    return build_content_repository().upsert_project_asset(table_name, payload)

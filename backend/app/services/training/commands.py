from __future__ import annotations

import uuid
from datetime import datetime

from app.core.exceptions import InfraError, NotFoundError, ValidationError
from app.repositories.training_repository import TrainingRepository
from app.repositories.types import (
    ModuleProgressRow,
    TrainingAssignmentRow,
    TrainingModuleRow,
    TrainingRow,
)
from app.services.training.queries import compute_assignment_progress


def create_training_record(
    repo: TrainingRepository,
    *,
    project_id: str,
    title: str,
    description: str | None,
    created_by: str,
    status: str = "draft",
) -> TrainingRow:
    now = datetime.utcnow().isoformat()
    row: TrainingRow = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "title": title,
        "description": description,
        "status": status,
        "created_by": created_by,
        "cover_image_status": "generating",
        "created_at": now,
        "updated_at": now,
    }
    return repo.create_training(row)


def create_training_from_project(
    repo: TrainingRepository,
    *,
    project_id: str,
    organization_id: str,
    created_by: str,
    title: str,
    description: str | None,
    due_date: datetime | None,
    asset_types: list[str],
    assignee_ids: list[str],
    publish: bool,
) -> TrainingRow:
    ordered_asset_types = dedupe_preserving_order(asset_types)
    if not ordered_asset_types:
        raise ValidationError("At least one asset type is required")

    normalized_assignee_ids = dedupe_preserving_order(assignee_ids)

    try:
        training = repo.rpc_create_training_from_project(
            {
                "p_project_id": project_id,
                "p_organization_id": organization_id,
                "p_created_by": created_by,
                "p_title": title,
                "p_description": description,
                "p_due_date": due_date.isoformat() if due_date else None,
                "p_asset_types": ordered_asset_types,
                "p_assignee_ids": normalized_assignee_ids,
                "p_publish": publish,
            }
        )
        return repo.update_training(
            training["id"],
            {
                "cover_image_status": "generating",
                "cover_image_error": None,
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
    except InfraError as exc:
        _raise_training_rpc_error(exc, default_message="Failed to create training from project")


def update_training_record(
    repo: TrainingRepository,
    *,
    training_id: str,
    title: str | None,
    description: str | None,
    status: str | None,
) -> TrainingRow:
    update_data: dict[str, object] = {}
    if title is not None:
        update_data["title"] = title
    if description is not None:
        update_data["description"] = description
    if status is not None:
        update_data["status"] = status

    if not update_data:
        raise ValidationError("No updatable fields provided")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    return repo.update_training(training_id, update_data)


def delete_training_record(repo: TrainingRepository, training_id: str) -> None:
    repo.delete_training(training_id)


def create_module_record(
    repo: TrainingRepository,
    *,
    training_id: str,
    title: str,
    description: str | None,
    module_type: str,
    sort_order: int,
    content_url: str | None,
    content_body: str | None,
    is_required: bool,
    estimated_duration_minutes: int | None,
) -> TrainingModuleRow:
    now = datetime.utcnow().isoformat()
    row: TrainingModuleRow = {
        "id": str(uuid.uuid4()),
        "training_id": training_id,
        "title": title,
        "description": description,
        "module_type": module_type,
        "sort_order": sort_order,
        "content_url": content_url,
        "content_body": content_body,
        "is_required": is_required,
        "estimated_duration_minutes": estimated_duration_minutes,
        "created_at": now,
        "updated_at": now,
    }
    return repo.create_module(row)


def update_module_record(
    repo: TrainingRepository,
    *,
    training_id: str,
    module_id: str,
    title: str | None,
    description: str | None,
    module_type: str | None,
    sort_order: int | None,
    content_url: str | None,
    content_body: str | None,
    is_required: bool | None,
    estimated_duration_minutes: int | None,
) -> TrainingModuleRow:
    update_data: dict[str, object] = {}
    for key, value in {
        "title": title,
        "description": description,
        "module_type": module_type,
        "sort_order": sort_order,
        "content_url": content_url,
        "content_body": content_body,
        "is_required": is_required,
        "estimated_duration_minutes": estimated_duration_minutes,
    }.items():
        if value is not None:
            update_data[key] = value

    if not update_data:
        raise ValidationError("No updatable fields provided")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    return repo.update_module(
        training_id=training_id,
        module_id=module_id,
        update_data=update_data,
    )


def delete_module_record(
    repo: TrainingRepository,
    *,
    training_id: str,
    module_id: str,
) -> None:
    repo.delete_module(training_id=training_id, module_id=module_id)


def reorder_training_modules(
    repo: TrainingRepository,
    *,
    training_id: str,
    modules: list[dict[str, str | int]],
) -> None:
    try:
        repo.rpc_reorder_training_modules(
            {
                "p_training_id": training_id,
                "p_modules": [
                    {
                        "module_id": str(module["module_id"]),
                        "sort_order": module["sort_order"],
                    }
                    for module in modules
                ],
            }
        )
    except InfraError as exc:
        _raise_training_rpc_error(exc, default_message="Failed to reorder training modules")


def create_assignment_record(
    repo: TrainingRepository,
    *,
    training_id: str,
    organization_id: str,
    user_id: str,
    assigned_by: str,
    due_date: datetime | None,
) -> TrainingAssignmentRow:
    validate_training_assignee(
        repo,
        organization_id=organization_id,
        assignee_id=user_id,
    )

    now = datetime.utcnow().isoformat()
    row: TrainingAssignmentRow = {
        "id": str(uuid.uuid4()),
        "training_id": training_id,
        "user_id": user_id,
        "assigned_by": assigned_by,
        "status": "assigned",
        "due_date": due_date.isoformat() if due_date else None,
        "created_at": now,
        "updated_at": now,
    }

    result = repo.create_assignment(row)
    result["progress_pct"] = 0
    return result


def update_assignment_record(
    repo: TrainingRepository,
    *,
    assignment_id: str,
    training_id: str,
    status: str | None,
    due_date: datetime | None,
) -> TrainingAssignmentRow:
    update_data: dict[str, object] = {}
    now = datetime.utcnow().isoformat()

    if status is not None:
        update_data["status"] = status
        if status == "in_progress" and "started_at" not in update_data:
            update_data["started_at"] = now
        if status == "completed":
            update_data["completed_at"] = now

    if due_date is not None:
        update_data["due_date"] = due_date.isoformat()

    if not update_data:
        raise ValidationError("No updatable fields provided")

    update_data["updated_at"] = now

    row = repo.update_assignment(assignment_id, update_data)
    row["progress_pct"] = compute_assignment_progress(
        repo,
        assignment_id=assignment_id,
        training_id=training_id,
    )
    return row


def delete_assignment_record(repo: TrainingRepository, assignment_id: str) -> None:
    repo.delete_assignment(assignment_id)


def update_module_progress_record(
    repo: TrainingRepository,
    *,
    assignment_id: str,
    training_id: str,
    module_id: str,
    status: str | None,
    progress_pct: int | None,
    last_position_seconds: int | None,
    score: int | None,
    max_score: int | None,
) -> ModuleProgressRow:
    try:
        return repo.rpc_update_module_progress(
            {
                "p_assignment_id": assignment_id,
                "p_training_id": training_id,
                "p_module_id": module_id,
                "p_status": status,
                "p_progress_pct": progress_pct,
                "p_last_position_seconds": last_position_seconds,
                "p_score": score,
                "p_max_score": max_score,
            }
        )
    except InfraError as exc:
        _raise_training_rpc_error(exc, default_message="Failed to update module progress")


def validate_training_assignee(
    repo: TrainingRepository,
    *,
    organization_id: str,
    assignee_id: str,
) -> None:
    _validate_assignee_membership(
        repo,
        organization_id=organization_id,
        assignee_ids=[assignee_id],
    )


def dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered_values: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered_values.append(value)
    return ordered_values


def _validate_assignee_membership(
    repo: TrainingRepository,
    *,
    organization_id: str,
    assignee_ids: list[str],
) -> None:
    member_ids = repo.list_org_member_user_ids(
        organization_id=organization_id,
        assignee_ids=assignee_ids,
    )
    missing_assignee_ids = [
        assignee_id
        for assignee_id in assignee_ids
        if assignee_id not in member_ids
    ]
    if missing_assignee_ids:
        raise ValidationError(
            f"Assignees must belong to the organization: {', '.join(missing_assignee_ids)}"
        )


def _raise_training_rpc_error(exc: Exception, *, default_message: str) -> None:
    message = str(exc)
    normalized = message.lower()

    if "not found" in normalized:
        raise NotFoundError(message) from exc

    validation_markers = (
        "at least one asset type is required",
        "selected assets are not available for this project",
        "assignees must belong to the organization",
        "does not belong to organization",
        "created_by must be an admin of the organization",
        "modules payload must be a json array",
        "modules payload must not be empty",
        "duplicate module ids are not allowed",
        "modules do not belong to this training",
        "at least one progress field is required",
        "assignment does not belong to this training",
        "module does not belong to this training",
    )
    if any(marker in normalized for marker in validation_markers):
        raise ValidationError(message) from exc

    raise InfraError(f"{default_message}: {message}") from exc

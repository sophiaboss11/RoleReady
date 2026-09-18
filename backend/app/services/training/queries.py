from __future__ import annotations

from collections import defaultdict
from typing import TypedDict

from app.core.exceptions import ValidationError
from app.repositories.training_repository import TrainingRepository
from app.repositories.types import (
    ModuleProgressRow,
    ProfileRow,
    TrainingAssignmentRow,
    TrainingModuleRow,
    TrainingRow,
)


class TrainingSummaryRow(TrainingRow, total=False):
    module_count: int
    assignment_count: int
    average_progress_pct: int
    viewer_assignment_id: str | None
    viewer_assignment_status: str | None
    viewer_progress_pct: int | None


class TrainingOverviewRow(TypedDict):
    training: TrainingRow
    modules: list[TrainingModuleRow]
    viewer_assignment: TrainingAssignmentRow | None
    viewer_progress: list[ModuleProgressRow]
    assignments: list[TrainingAssignmentRow]
    leaderboard: list[dict]


def list_training_summary_records(
    repo: TrainingRepository,
    *,
    viewer_user_id: str,
    project_id: str | None,
    organization_id: str | None,
    limit: int,
    offset: int,
) -> list[TrainingSummaryRow]:
    if not project_id and not organization_id:
        raise ValidationError("project_id or organization_id is required")

    trainings = repo.list_trainings(
        project_id=project_id,
        organization_id=organization_id,
        limit=limit,
        offset=offset,
    )
    return build_training_summaries(repo, trainings, viewer_user_id)


def get_training_record(repo: TrainingRepository, training_id: str) -> TrainingRow:
    return repo.get_training(training_id)


def get_training_overview_record(
    repo: TrainingRepository,
    *,
    training_id: str,
    viewer_user_id: str,
    is_admin: bool,
) -> TrainingOverviewRow:
    training = get_training_record(repo, training_id)
    overview = build_training_overview(
        repo,
        training=training,
        viewer_user_id=viewer_user_id,
        is_admin=is_admin,
    )

    user_ids = [assignment["user_id"] for assignment in overview["assignments"]]
    if overview["viewer_assignment"]:
        user_ids.append(overview["viewer_assignment"]["user_id"])

    profiles = repo.list_profiles(user_ids)
    overview["assignments"] = [
        _attach_profile(assignment, profiles)
        for assignment in overview["assignments"]
    ]
    if overview["viewer_assignment"]:
        overview["viewer_assignment"] = _attach_profile(
            overview["viewer_assignment"],
            profiles,
        )

    return overview


def list_module_records(repo: TrainingRepository, training_id: str) -> list[TrainingModuleRow]:
    return repo.list_modules([training_id])


def list_assignment_records_with_progress(
    repo: TrainingRepository,
    *,
    training_id: str,
) -> list[TrainingAssignmentRow]:
    assignments = repo.list_assignments([training_id])
    if not assignments:
        return []

    modules = repo.list_modules([training_id])
    progress_rows = repo.list_progress([assignment["id"] for assignment in assignments])
    progress_by_assignment_id = compute_assignment_progresses(
        modules=modules,
        assignments=assignments,
        progress_rows=progress_rows,
    )
    profiles = repo.list_profiles([assignment["user_id"] for assignment in assignments])

    return [
        _attach_profile(
            {
                **assignment,
                "progress_pct": progress_by_assignment_id.get(assignment["id"], 0),
            },
            profiles,
        )
        for assignment in assignments
    ]


def get_assignment_record_with_progress(
    repo: TrainingRepository,
    assignment_id: str,
) -> TrainingAssignmentRow:
    row = repo.get_assignment(assignment_id)
    row["progress_pct"] = compute_assignment_progress(
        repo,
        assignment_id=assignment_id,
        training_id=row["training_id"],
    )
    profiles = repo.list_profiles([row["user_id"]])
    return _attach_profile(row, profiles)


def list_progress_records(
    repo: TrainingRepository,
    assignment_id: str,
) -> list[ModuleProgressRow]:
    return repo.list_progress([assignment_id])


def build_training_summaries(
    repo: TrainingRepository,
    trainings: list[TrainingRow],
    viewer_user_id: str,
) -> list[TrainingSummaryRow]:
    if not trainings:
        return []

    training_ids = [training["id"] for training in trainings]
    modules = repo.list_modules(training_ids)
    assignments = repo.list_assignments(training_ids)
    progress_rows = repo.list_progress([assignment["id"] for assignment in assignments])

    assignment_progress_by_id = compute_assignment_progresses(
        modules=modules,
        assignments=assignments,
        progress_rows=progress_rows,
    )
    modules_by_training_id = _group_modules_by_training_id(modules)
    assignments_by_training_id = _group_assignments_by_training_id(assignments)

    summaries: list[TrainingSummaryRow] = []
    for training in trainings:
        training_id = training["id"]
        training_assignments = assignments_by_training_id.get(training_id, [])
        viewer_assignment = next(
            (
                assignment
                for assignment in training_assignments
                if assignment["user_id"] == viewer_user_id
            ),
            None,
        )

        assignment_progress_values = [
            assignment_progress_by_id[assignment["id"]]
            for assignment in training_assignments
        ]

        summaries.append(
            {
                **training,
                "module_count": len(modules_by_training_id.get(training_id, [])),
                "assignment_count": len(training_assignments),
                "average_progress_pct": average_percent(assignment_progress_values),
                "viewer_assignment_id": viewer_assignment["id"] if viewer_assignment else None,
                "viewer_assignment_status": viewer_assignment["status"] if viewer_assignment else None,
                "viewer_progress_pct": (
                    assignment_progress_by_id.get(viewer_assignment["id"])
                    if viewer_assignment
                    else None
                ),
            }
        )

    return summaries


def build_training_overview(
    repo: TrainingRepository,
    *,
    training: TrainingRow,
    viewer_user_id: str,
    is_admin: bool,
) -> TrainingOverviewRow:
    training_id = training["id"]
    modules = repo.list_modules([training_id])

    # Always fetch all assignments for leaderboard
    all_assignments = repo.list_assignments([training_id])

    # Admin sees full assignment details; members see only their own
    assignments = all_assignments if is_admin else []

    viewer_assignment = next(
        (a for a in all_assignments if a["user_id"] == viewer_user_id),
        None,
    )

    all_assignment_ids = [a["id"] for a in all_assignments]
    progress_rows = repo.list_progress(all_assignment_ids)
    progress_by_assignment_id = compute_assignment_progresses(
        modules=modules,
        assignments=all_assignments,
        progress_rows=progress_rows,
    )

    viewer_progress_rows = [
        row
        for row in progress_rows
        if viewer_assignment and row["assignment_id"] == viewer_assignment["id"]
    ]

    detailed_assignments = [
        {
            **assignment,
            "progress_pct": progress_by_assignment_id.get(assignment["id"], 0),
        }
        for assignment in assignments
    ]

    detailed_viewer_assignment = (
        {
            **viewer_assignment,
            "progress_pct": progress_by_assignment_id.get(viewer_assignment["id"], 0),
        }
        if viewer_assignment
        else None
    )

    # Leaderboard: lightweight summary for ALL assigned users (visible to everyone)
    user_ids = [a["user_id"] for a in all_assignments]
    profiles = repo.list_profiles(user_ids)
    leaderboard = [
        {
            "user_id": a["user_id"],
            "display_name": profiles.get(a["user_id"], {}).get("display_name"),
            "avatar_url": profiles.get(a["user_id"], {}).get("avatar_url"),
            "progress_pct": progress_by_assignment_id.get(a["id"], 0),
            "status": a["status"],
        }
        for a in all_assignments
    ]

    return {
        "training": training,
        "modules": sorted(modules, key=lambda row: row["sort_order"]),
        "viewer_assignment": detailed_viewer_assignment,
        "viewer_progress": viewer_progress_rows,
        "assignments": detailed_assignments,
        "leaderboard": leaderboard,
    }


def compute_assignment_progress(
    repo: TrainingRepository,
    *,
    assignment_id: str,
    training_id: str,
) -> int:
    modules = repo.list_modules([training_id])
    progress_rows = repo.list_progress([assignment_id])
    assignment: TrainingAssignmentRow = {
        "id": assignment_id,
        "training_id": training_id,
        "status": "assigned",
    }
    return compute_assignment_progresses(
        modules=modules,
        assignments=[assignment],
        progress_rows=progress_rows,
    ).get(assignment_id, 0)


def compute_assignment_progresses(
    *,
    modules: list[TrainingModuleRow],
    assignments: list[TrainingAssignmentRow],
    progress_rows: list[ModuleProgressRow],
) -> dict[str, int]:
    module_ids_by_training_id = _group_module_ids_by_training_id(modules)
    progress_rows_by_assignment_id = _group_progress_by_assignment_id(progress_rows)

    progress_by_assignment_id: dict[str, int] = {}
    for assignment in assignments:
        training_id = assignment["training_id"]
        module_ids = module_ids_by_training_id.get(training_id, set())
        completed_module_ids = _completed_module_ids(
            progress_rows_by_assignment_id.get(assignment["id"], []),
            module_ids,
        )
        progress_by_assignment_id[assignment["id"]] = completion_percentage(
            completed_count=len(completed_module_ids),
            total_count=len(module_ids),
        )

    return progress_by_assignment_id


def completion_percentage(*, completed_count: int, total_count: int) -> int:
    if total_count <= 0:
        return 0
    return round(completed_count / total_count * 100)


def average_percent(values: list[int]) -> int:
    if not values:
        return 0
    return round(sum(values) / len(values))


def _group_modules_by_training_id(
    modules: list[TrainingModuleRow],
) -> dict[str, list[TrainingModuleRow]]:
    grouped: dict[str, list[TrainingModuleRow]] = defaultdict(list)
    for module in modules:
        grouped[module["training_id"]].append(module)
    return grouped


def _group_module_ids_by_training_id(
    modules: list[TrainingModuleRow],
) -> dict[str, set[str]]:
    grouped: dict[str, set[str]] = defaultdict(set)
    for module in modules:
        grouped[module["training_id"]].add(module["id"])
    return grouped


def _group_assignments_by_training_id(
    assignments: list[TrainingAssignmentRow],
) -> dict[str, list[TrainingAssignmentRow]]:
    grouped: dict[str, list[TrainingAssignmentRow]] = defaultdict(list)
    for assignment in assignments:
        grouped[assignment["training_id"]].append(assignment)
    return grouped


def _group_progress_by_assignment_id(
    progress_rows: list[ModuleProgressRow],
) -> dict[str, list[ModuleProgressRow]]:
    grouped: dict[str, list[ModuleProgressRow]] = defaultdict(list)
    for row in progress_rows:
        grouped[row["assignment_id"]].append(row)
    return grouped


def _completed_module_ids(
    progress_rows: list[ModuleProgressRow],
    module_ids: set[str],
) -> set[str]:
    return {
        progress_row["module_id"]
        for progress_row in progress_rows
        if progress_row["status"] == "completed" and progress_row["module_id"] in module_ids
    }


def _attach_profile(
    row: TrainingAssignmentRow,
    profiles: dict[str, ProfileRow],
) -> TrainingAssignmentRow:
    profile = profiles.get(row["user_id"], {})
    return {
        **row,
        "display_name": profile.get("display_name"),
        "avatar_url": profile.get("avatar_url"),
    }

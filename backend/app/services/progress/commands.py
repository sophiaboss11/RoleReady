from __future__ import annotations

from app.repositories.progress_repository import ProgressRepository


def complete_step(
    repo: ProgressRepository,
    *,
    user_id: str,
    step_id: str,
    score: int | None = None,
    max_score: int | None = None,
) -> None:
    """
    Project step completion into lesson and training snapshots.
    This is the canonical entry point for marking a step as done.
    """
    repo.project_step_completion(
        user_id=user_id,
        step_id=step_id,
        score=score,
        max_score=max_score,
    )

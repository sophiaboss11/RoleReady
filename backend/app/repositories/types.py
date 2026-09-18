from __future__ import annotations

from typing import Any, TypedDict


class ProjectRow(TypedDict, total=False):
    id: str
    title: str
    description: str
    organization_id: str
    github_link: str | None
    jira_link: str | None
    confluence_link: str | None
    status: str
    created_at: str
    updated_at: str


class DocumentRow(TypedDict, total=False):
    id: str
    project_id: str
    filename: str
    content: str
    chunk_index: int
    metadata: dict[str, Any]
    processed: bool
    created_at: str
    updated_at: str


class TrainingRow(TypedDict, total=False):
    id: str
    project_id: str
    title: str
    description: str | None
    status: str
    created_by: str
    cover_image_url: str | None
    cover_image_status: str
    cover_image_prompt: str | None
    cover_image_error: str | None
    cover_image_generated_at: str | None
    created_at: str
    updated_at: str


class TrainingModuleRow(TypedDict, total=False):
    id: str
    training_id: str
    title: str
    description: str | None
    module_type: str
    sort_order: int
    content_url: str | None
    content_body: str | None
    is_required: bool
    estimated_duration_minutes: int | None
    created_at: str
    updated_at: str


class TrainingAssignmentRow(TypedDict, total=False):
    id: str
    training_id: str
    user_id: str
    assigned_by: str
    status: str
    due_date: str | None
    started_at: str | None
    completed_at: str | None
    created_at: str
    updated_at: str
    progress_pct: int
    display_name: str | None
    avatar_url: str | None


class ModuleProgressRow(TypedDict, total=False):
    id: str
    assignment_id: str
    module_id: str
    status: str
    progress_pct: int
    last_position_seconds: int | None
    score: int | None
    max_score: int | None
    attempts: int
    started_at: str | None
    completed_at: str | None
    updated_at: str


class TrainingLessonRow(TypedDict, total=False):
    id: str
    training_id: str
    title: str
    description: str | None
    sort_order: int
    is_required: bool
    unlock_rule: str
    estimated_duration_minutes: int | None
    created_at: str
    updated_at: str


class LessonStepRow(TypedDict, total=False):
    id: str
    lesson_id: str
    title: str
    description: str | None
    step_type: str
    sort_order: int
    content_url: str | None
    content_body: str | None
    is_required: bool
    is_scorable: bool
    max_score: int | None
    pass_threshold: int | None
    estimated_duration_minutes: int | None
    created_at: str
    updated_at: str


class LessonStepContextRow(TypedDict, total=False):
    id: str
    lesson_id: str
    training_id: str
    step_type: str
    is_required: bool
    is_scorable: bool


class LessonDependencyRow(TypedDict, total=False):
    id: str
    lesson_id: str
    prerequisite_id: str


class LearningSessionRow(TypedDict, total=False):
    id: str
    user_id: str
    training_id: str
    lesson_id: str | None
    step_id: str | None
    started_at: str
    ended_at: str | None
    duration_seconds: int | None
    status: str
    created_at: str
    updated_at: str


class LearningEventRow(TypedDict, total=False):
    id: str
    session_id: str
    user_id: str
    event_type: str
    step_id: str | None
    payload: dict[str, Any]
    created_at: str


class StepAttemptRow(TypedDict, total=False):
    id: str
    user_id: str
    step_id: str
    session_id: str | None
    attempt_number: int
    score: int | None
    max_score: int | None
    passed: bool | None
    answer_payload: dict[str, Any]
    started_at: str
    completed_at: str | None
    created_at: str


class XpLedgerRow(TypedDict, total=False):
    id: str
    user_id: str
    amount: int
    reason: str
    source_type: str
    source_id: str | None
    training_id: str | None
    created_at: str


class LearnerGamificationProfileRow(TypedDict, total=False):
    user_id: str
    total_xp: int
    level: int
    current_streak_days: int
    longest_streak_days: int
    total_watch_seconds: int
    total_listen_seconds: int
    total_lessons_completed: int
    total_steps_completed: int
    quiz_total_score: int
    quiz_total_max_score: int
    updated_at: str


class DailyActivityRow(TypedDict, total=False):
    id: str
    user_id: str
    activity_date: str
    xp_earned: int
    lessons_completed: int
    steps_completed: int
    watch_seconds: int
    listen_seconds: int
    quiz_attempts: int
    created_at: str
    updated_at: str


class LeaderboardSnapshotRow(TypedDict, total=False):
    id: str
    organization_id: str
    period_type: str
    period_start: str
    period_end: str
    user_id: str
    rank: int
    xp_earned: int
    created_at: str


class ChallengeRow(TypedDict, total=False):
    id: str
    organization_id: str
    title: str
    description: str | None
    challenge_type: str
    target_value: int
    metric: str
    start_date: str
    end_date: str
    reward_xp: int
    status: str
    created_by: str
    created_at: str
    updated_at: str


class ChallengeParticipationRow(TypedDict, total=False):
    id: str
    challenge_id: str
    user_id: str
    current_value: int
    completed: bool
    completed_at: str | None
    created_at: str
    updated_at: str


class LearnerTrainingProgressRow(TypedDict, total=False):
    user_id: str
    training_id: str
    status: str
    progress_pct: int
    completed_lessons: int
    total_lessons: int
    started_at: str | None
    completed_at: str | None
    last_active_at: str | None
    updated_at: str | None


class LearnerLessonProgressRow(TypedDict, total=False):
    user_id: str
    lesson_id: str
    training_id: str
    status: str
    progress_pct: int
    completed_steps: int
    total_steps: int
    best_score: int | None
    started_at: str | None
    completed_at: str | None
    updated_at: str | None


class LearnerStepProgressRow(TypedDict, total=False):
    user_id: str
    step_id: str
    lesson_id: str
    status: str
    progress_pct: int
    best_score: int | None
    best_max_score: int | None
    attempts: int
    watch_seconds: int
    listen_seconds: int
    last_position_seconds: int | None
    started_at: str | None
    completed_at: str | None
    updated_at: str | None


class ProfileRow(TypedDict, total=False):
    id: str
    display_name: str | None
    avatar_url: str | None

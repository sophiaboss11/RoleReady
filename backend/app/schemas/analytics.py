"""Schemas for manager analytics."""

from typing import Optional

from pydantic import BaseModel, Field


class TrainingAnalytics(BaseModel):
    training_id: str
    title: str
    total_assigned: int
    total_started: int
    total_completed: int
    average_progress_pct: int
    average_completion_days: Optional[float]


class LessonAnalytics(BaseModel):
    lesson_id: str
    title: str
    total_started: int
    total_completed: int
    completion_rate_pct: int
    average_score: Optional[float]
    drop_off_count: int


class LearnerAnalytics(BaseModel):
    user_id: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    total_xp: int
    level: int
    streak_days: int
    trainings_completed: int
    lessons_completed: int
    quiz_accuracy_pct: int


class AttentionLearnerAnalytics(BaseModel):
    user_id: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    overdue_assignments: int
    not_started_assignments: int


class BottleneckAnalysis(BaseModel):
    lesson_id: str
    lesson_title: str
    drop_off_rate_pct: int
    average_attempts: float
    average_completion_seconds: Optional[float]


class ManagerDashboardResponse(BaseModel):
    organization_id: str
    total_learners: int
    active_learners_7d: int
    total_trainings: int
    average_completion_pct: int
    total_assignments: int
    completed_assignments: int
    in_progress_assignments: int
    assigned_learners: int
    average_progress_pct: int
    not_started_assignments: int
    overdue_assignments: int
    due_soon_assignments: int
    needs_attention_learners: int
    engagement_rate_7d_pct: int
    sessions_started_7d: int
    abandoned_sessions_7d: int
    attention_learners: list[AttentionLearnerAnalytics] = Field(default_factory=list)
    top_performers: list[LearnerAnalytics] = Field(default_factory=list)
    training_stats: list[TrainingAnalytics] = Field(default_factory=list)
    bottlenecks: list[BottleneckAnalysis] = Field(default_factory=list)

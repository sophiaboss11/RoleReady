"""Schemas for the training system.

Covers training CRUD, module management, user assignments,
and per-module progress tracking.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


TrainingStatus = Literal["draft", "published", "archived"]
TrainingCoverImageStatus = Literal["pending", "generating", "ready", "failed"]
ModuleType = Literal["video", "audio", "document", "quiz", "infographic", "mindmap", "summary"]
AssignmentStatus = Literal["assigned", "in_progress", "completed"]
ModuleProgressStatus = Literal["not_started", "in_progress", "completed"]
ProjectBackedTrainingAssetType = Literal["audio", "video", "infographic", "mindmap", "summary"]


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

class TrainingCreate(BaseModel):
    project_id: UUID = Field(..., description="Project this training is generated from")
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)


class TrainingUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[TrainingStatus] = Field(None, description="draft | published | archived")


class TrainingResponse(BaseModel):
    id: str
    project_id: str
    title: str
    description: Optional[str]
    status: TrainingStatus
    created_by: str
    cover_image_url: Optional[str] = None
    cover_image_status: TrainingCoverImageStatus = "pending"
    cover_image_error: Optional[str] = None
    cover_image_generated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TrainingSummaryResponse(TrainingResponse):
    module_count: int = Field(default=0, ge=0)
    assignment_count: int = Field(default=0, ge=0)
    average_progress_pct: int = Field(default=0, ge=0, le=100)
    viewer_assignment_id: Optional[str] = None
    viewer_assignment_status: Optional[AssignmentStatus] = None
    viewer_progress_pct: Optional[int] = Field(default=None, ge=0, le=100)


class TrainingCreateFromProject(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    due_date: Optional[datetime] = None
    asset_types: list[ProjectBackedTrainingAssetType] = Field(..., min_length=1)
    assignee_ids: list[UUID] = Field(default_factory=list)
    publish: bool = True


# ---------------------------------------------------------------------------
# Training Module
# ---------------------------------------------------------------------------

class TrainingModuleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    module_type: ModuleType = Field(..., description="video | audio | document | quiz | infographic | mindmap | summary")
    sort_order: int = Field(default=0, ge=0)
    content_url: Optional[str] = Field(None, description="External resource URL")
    content_body: Optional[str] = Field(None, description="Inline content (quiz JSON, reading material)")
    is_required: bool = Field(default=True)
    estimated_duration_minutes: Optional[int] = Field(None, ge=1)


class TrainingModuleUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    module_type: Optional[ModuleType] = None
    sort_order: Optional[int] = Field(None, ge=0)
    content_url: Optional[str] = None
    content_body: Optional[str] = None
    is_required: Optional[bool] = None
    estimated_duration_minutes: Optional[int] = Field(None, ge=1)


class TrainingModuleResponse(BaseModel):
    id: str
    training_id: str
    title: str
    description: Optional[str]
    module_type: ModuleType
    sort_order: int
    content_url: Optional[str]
    content_body: Optional[str]
    is_required: bool
    estimated_duration_minutes: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ModuleReorderItem(BaseModel):
    module_id: UUID
    sort_order: int = Field(..., ge=0)


class ModuleReorderRequest(BaseModel):
    modules: list[ModuleReorderItem] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Training Assignment
# ---------------------------------------------------------------------------

class TrainingAssignmentCreate(BaseModel):
    user_id: UUID = Field(..., description="User to assign this training to")
    due_date: Optional[datetime] = None


class TrainingAssignmentUpdate(BaseModel):
    status: Optional[AssignmentStatus] = Field(None, description="assigned | in_progress | completed")
    due_date: Optional[datetime] = None


class TrainingAssignmentResponse(BaseModel):
    id: str
    training_id: str
    user_id: str
    assigned_by: str
    status: AssignmentStatus
    due_date: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    progress_pct: int = Field(default=0, description="Computed: completed modules / total modules")
    display_name: Optional[str] = Field(default=None, description="User display name from profile")
    avatar_url: Optional[str] = Field(default=None, description="User avatar URL from profile")

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Module Progress
# ---------------------------------------------------------------------------

class ModuleProgressUpdate(BaseModel):
    status: Optional[ModuleProgressStatus] = Field(None, description="not_started | in_progress | completed")
    progress_pct: Optional[int] = Field(None, ge=0, le=100)
    last_position_seconds: Optional[int] = Field(None, ge=0)
    score: Optional[int] = Field(None, ge=0)
    max_score: Optional[int] = Field(None, ge=0)


class ModuleProgressResponse(BaseModel):
    id: str
    assignment_id: str
    module_id: str
    status: ModuleProgressStatus
    progress_pct: int
    last_position_seconds: Optional[int]
    score: Optional[int]
    max_score: Optional[int]
    attempts: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: datetime

    class Config:
        from_attributes = True


class TrainingLeaderboardEntry(BaseModel):
    user_id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    progress_pct: int = Field(default=0, ge=0, le=100)
    status: AssignmentStatus

    class Config:
        from_attributes = True


class TrainingOverviewResponse(BaseModel):
    training: TrainingResponse
    modules: list[TrainingModuleResponse] = Field(default_factory=list)
    viewer_assignment: Optional[TrainingAssignmentResponse] = None
    viewer_progress: list[ModuleProgressResponse] = Field(default_factory=list)
    assignments: list[TrainingAssignmentResponse] = Field(default_factory=list)
    leaderboard: list[TrainingLeaderboardEntry] = Field(default_factory=list)

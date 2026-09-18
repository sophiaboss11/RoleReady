from pydantic import BaseModel
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime

JobType = Literal[
    'project_pipeline',
    'github_ingestion',
    'jira_ingestion',
    'confluence_ingestion',
    'document_ingestion',
    'infographic_generation',
    'mindmap_generation',
    'tts_generation',
    'video_generation',
    'training_cover_generation',
]
JobStatus = Literal['pending', 'running', 'completed', 'failed']


class Job(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    job_type: JobType
    status: JobStatus
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

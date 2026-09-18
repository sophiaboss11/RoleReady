"""
Pydantic models for ingestion tracking and audit.
"""
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any

class IngestionRun(BaseModel):
    """Model for tracking ingestion runs."""
    id: UUID
    project_id: UUID
    run_type: str  # 'jira', 'confluence', 'github', 'documents'
    status: str  # 'running', 'completed', 'failed', 'partial'
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_documents: int = 0
    successful_documents: int = 0
    failed_documents: int = 0
    total_chunks: int = 0
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class IngestionFileStatus(BaseModel):
    """Model for tracking individual file processing status."""
    id: UUID
    ingestion_run_id: UUID
    document_id: Optional[UUID] = None
    file_name: Optional[str] = None
    source_url: Optional[str] = None
    source_type: Optional[str] = None
    status: str  # 'pending', 'processing', 'completed', 'failed'
    chunks_created: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class IngestionRunCreate(BaseModel):
    """Schema for creating a new ingestion run."""
    project_id: UUID
    run_type: str
    metadata: Optional[Dict[str, Any]] = None
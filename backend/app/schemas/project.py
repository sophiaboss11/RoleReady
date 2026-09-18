from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

class ProjectCreate(BaseModel):
    """Schema for creating a new project"""
    title: str = Field(..., min_length=1, max_length=255, description="Name/title of the project")
    description: str = Field(..., min_length=1, description="Description of the project")
    organization_id: UUID = Field(..., description="Organization ID this project belongs to")
    github_link: Optional[str] = Field(None, description="Optional GitHub repository link")
    jira_link: Optional[str] = Field(None, description="Optional Jira project link")
    confluence_link: Optional[str] = Field(None, description="Optional Confluence space link")
    repository_token: Optional[str] = Field(None, description="Optional repository token for private repo access")


class ProjectUpdate(BaseModel):
    """Schema for updating an existing project"""
    title: Optional[str] = Field(None, min_length=1, max_length=255, description="Name/title of the project")
    description: Optional[str] = Field(None, min_length=1, description="Description of the project")
    organization_id: Optional[UUID] = Field(None, description="Organization ID this project belongs to")
    github_link: Optional[str] = Field(None, description="GitHub repository link")
    jira_link: Optional[str] = Field(None, description="Jira project link")
    confluence_link: Optional[str] = Field(None, description="Confluence space link")
    repository_token: Optional[str] = Field(None, description="Optional repository token for private repo access")


class ProjectResponse(BaseModel):
    """Schema for project response"""
    id: str = Field(..., description="Unique project identifier (project_id)")
    title: str = Field(..., description="Name/title of the project")
    description: str = Field(..., description="Description of the project")
    organization_id: Optional[str] = Field(None, description="Organization ID this project belongs to")
    github_link: Optional[str] = Field(None, description="GitHub repository link")
    jira_link: Optional[str] = Field(None, description="Jira project link")
    confluence_link: Optional[str] = Field(None, description="Confluence space link")
    status: str = Field("created", description="Current project pipeline status")
    created_at: datetime = Field(..., description="Project creation timestamp")
    updated_at: datetime = Field(..., description="Project last update timestamp")

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    """Schema for document response"""
    id: str = Field(..., description="Unique document identifier")
    project_id: str = Field(..., description="Associated project identifier")
    filename: str = Field(..., description="Original filename")
    content: str = Field(..., description="Document content")
    chunk_index: int = Field(default=0, description="Chunk index for large files")
    metadata: dict = Field(default_factory=dict, description="Additional document metadata")
    processed: bool = Field(default=False, description="Whether document has been processed")
    created_at: str = Field(..., description="Document upload timestamp")
    updated_at: str = Field(..., description="Document last update timestamp")

    class Config:
        from_attributes = True

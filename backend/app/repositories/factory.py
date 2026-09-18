from __future__ import annotations

"""Single entry point for database-backed repositories.

Application services and API endpoints should build repositories here
instead of importing ``get_service_role_client`` directly.
"""

from app.core.supabase import get_service_role_client
from app.repositories.content_repository import ContentRepository
from app.repositories.ingestion_repository import DocumentRepository, EmbeddingRepository
from app.repositories.job_repository import JobRepository
from app.repositories.prompt_repository import PromptRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.storage_repository import StorageRepository
from app.repositories.curriculum_repository import CurriculumRepository
from app.repositories.engagement_repository import EngagementRepository
from app.repositories.gamification_repository import GamificationRepository
from app.repositories.progress_repository import ProgressRepository
from app.repositories.social_repository import SocialRepository
from app.repositories.training_repository import TrainingRepository


def build_curriculum_repository() -> CurriculumRepository:
    return CurriculumRepository(get_service_role_client())


def build_engagement_repository() -> EngagementRepository:
    return EngagementRepository(get_service_role_client())


def build_gamification_repository() -> GamificationRepository:
    return GamificationRepository(get_service_role_client())


def build_social_repository() -> SocialRepository:
    return SocialRepository(get_service_role_client())


def build_progress_repository() -> ProgressRepository:
    return ProgressRepository(get_service_role_client())


def build_project_repository() -> ProjectRepository:
    return ProjectRepository(get_service_role_client())


def build_training_repository() -> TrainingRepository:
    return TrainingRepository(get_service_role_client())


def build_content_repository() -> ContentRepository:
    return ContentRepository(get_service_role_client())


def build_embedding_repository() -> EmbeddingRepository:
    return EmbeddingRepository(get_service_role_client())


def build_document_repository() -> DocumentRepository:
    return DocumentRepository(get_service_role_client())


def build_prompt_repository() -> PromptRepository:
    return PromptRepository(get_service_role_client())


def build_storage_repository() -> StorageRepository:
    return StorageRepository(get_service_role_client())


def build_job_repository() -> JobRepository:
    return JobRepository(get_service_role_client())

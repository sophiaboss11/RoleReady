from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    gemini_api_key: str = ""
    openai_api_key: str = ""
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_embedding_output_dimensionality: int = 3072
    training_cover_image_model: str = "gemini-3-pro-image-preview"
    training_cover_image_size: str = "1K"
    cors_origins: str = "http://localhost:4200"

    # Cloud Tasks / Worker
    use_cloud_tasks: bool = False
    gcp_project_id: str = ""
    gcp_region: str = "us-east1"
    cloud_tasks_queue: str = "role-ready-jobs"
    worker_url: str = ""
    cloud_tasks_service_account: str = ""
    
    # Ingestion Sources
    jira_url: str = ""
    jira_email: str = ""
    jira_api_token: str = ""
    confluence_url: str = ""
    confluence_email: str = ""
    confluence_api_token: str = ""

    # Video generation (server-side defaults for /video/generate)
    video_prompt_template: str = (
        "Create a single cohesive 10-minute educational video about the project '{title}'. "
        "Focus on the most important concepts and explain them clearly. "
        "Project description: {description}"
    )
    video_max_docs: int = 6
    video_require_context: bool = True
    video_max_slides: int = 8
    video_voice: str = "alloy"
    video_model: str = "tts-1"
    video_format: str = "mp3"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

from fastapi import APIRouter, Depends

from app.api.v1.endpoints import analytics, architecture, curriculum, engagement, gamification, infographics, ingestion, jobs, mindmap, pinpoint, progress, project, prompts, social, summarization, training, tts, video
from app.core.auth import get_current_user

v1_router = APIRouter(
    prefix="/api/v1",
    dependencies=[Depends(get_current_user)],
)
# Note:
# - The router dependency above validates identity (JWT).
# - Each endpoint must still declare tenant authorization with
#   `ProjectMemberAccess` / `ProjectAdminAccess` / org-level helpers.

v1_router.include_router(ingestion.router, prefix="/ingestion", tags=["ingestion"])
v1_router.include_router(architecture.router, prefix="/architecture", tags=["architecture"])
v1_router.include_router(infographics.router, prefix="/infographics", tags=["infographics"])
v1_router.include_router(pinpoint.router, prefix="/pinpoint", tags=["pinpoint"])
v1_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
v1_router.include_router(mindmap.router, prefix="/mindmap", tags=["mindmap"])
v1_router.include_router(project.router, prefix="/projects", tags=["projects"])
v1_router.include_router(prompts.router, prefix="/prompts", tags=["prompts"])
v1_router.include_router(summarization.router, prefix="/summarization", tags=["summarization"])
v1_router.include_router(training.router, prefix="/trainings", tags=["trainings"])
v1_router.include_router(training.assignment_router, prefix="/assignments", tags=["assignments"])
v1_router.include_router(curriculum.router, prefix="/trainings", tags=["curriculum"])
v1_router.include_router(engagement.router, prefix="/engagement", tags=["engagement"])
v1_router.include_router(progress.router, prefix="/trainings", tags=["progress"])
v1_router.include_router(gamification.router, prefix="/gamification", tags=["gamification"])
v1_router.include_router(social.router, prefix="/social", tags=["social"])
v1_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
v1_router.include_router(tts.router, prefix="/tts", tags=["tts"])
v1_router.include_router(video.router, prefix="/video", tags=["video"])

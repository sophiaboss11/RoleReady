"""Reusable pipeline step implementations shared by endpoints, worker, and pipeline orchestration."""

from __future__ import annotations

from typing import Any, Optional

from app.services.content_generation.architecture_service import generate_and_save_architecture
from app.services.content_generation.generate_infographics import generate_infographic
from app.services.content_generation.infographic_service import upsert_infographic
from app.services.content_generation.mindmap import generate_mindmap
from app.services.content_generation.mindmap_service import upsert_mindmap
from app.services.content_generation.pinpoint_service import generate_and_save_pinpoint_questions
from app.services.content_generation.tts_service import generate_and_upload_audio, upsert_audio
from app.services.content_generation.video_generation import generate_and_upload_video_presentation
from app.services.content_generation.video_service import upsert_video
from app.services.data_ingestion.confluence_embeddings import process_confluence_space
from app.services.data_ingestion.document_embeddings import process_documents_for_project
from app.services.data_ingestion.github_embeddings import process_github_repo
from app.services.data_ingestion.jira_embeddings import process_jira_project


def run_confluence_ingestion(project_id: str, space_key: str) -> None:
    if not space_key:
        raise ValueError("space_key is required for confluence_ingestion")
    process_confluence_space(project_id, space_key)


def run_jira_ingestion(project_id: str, jira_project_key: str) -> None:
    if not jira_project_key:
        raise ValueError("jira_project_key is required for jira_ingestion")
    process_jira_project(project_id, jira_project_key)


def run_github_ingestion(project_id: str, repo_url: str, github_token: Optional[str] = None) -> None:
    if not repo_url:
        raise ValueError("repo_url is required for github_ingestion")
    process_github_repo(project_id, repo_url, github_token)


def run_document_ingestion(project_id: str, document_ids: Optional[list[str]] = None) -> int:
    if document_ids is None:
        return process_documents_for_project(project_id=project_id)
    return process_documents_for_project(project_id, document_ids)


def run_infographic_generation(project_id: str) -> dict[str, Any]:
    result = generate_infographic(project_id)

    return upsert_infographic(
        project_id=project_id,
        image_url=result.get("image_url"),
        infographic_text=result.get("text"),
    )


def run_mindmap_generation(
    project_id: str,
    *,
    query: str = "project overview",
    max_docs: int = 6,
    require_context: bool = True,
) -> dict[str, Any]:
    result = generate_mindmap(
        query=query,
        project_id=project_id,
        max_docs=max_docs,
        require_context=require_context,
    )

    return upsert_mindmap(
        project_id=project_id,
        mermaid=str(result.get("mermaid", "")),
        retrieved_count=int(result.get("retrievedCount", 0)),
        warning=result.get("warning"),
        sources=result.get("sources") or [],
    )


def run_tts_generation(
    project_id: str,
    *,
    voice: str = "alloy",
    model: str = "tts-1",
    fmt: str = "mp3",
) -> dict[str, Any]:
    result = generate_and_upload_audio(
        project_id=project_id,
        voice=voice,
        model=model,
        fmt=fmt,
    )

    return upsert_audio(
        project_id=project_id,
        audio_url=result.get("audio_url"),
        voice=voice,
        model=model,
        fmt=fmt,
        script=result.get("script"),
    )


def run_video_generation(
    project_id: str,
    *,
    prompt: str,
    max_docs: int = 6,
    require_context: bool = True,
    max_slides: int = 8,
    voice: str = "alloy",
    model: str = "tts-1",
    fmt: str = "mp3",
) -> dict[str, Any]:
    result = generate_and_upload_video_presentation(
        project_id=project_id,
        prompt=prompt,
        max_docs=max_docs,
        require_context=require_context,
        max_slides=max_slides,
        voice=voice,
        tts_model=model,
        tts_format=fmt,
    )

    return upsert_video(
        project_id=project_id,
        video_url=result.get("video_url"),
        prompt=prompt,
        retrieved_count=int(result.get("retrieved_count") or 0),
        slide_count=int(result.get("slide_count") or 0),
        warning=result.get("warning"),
        metadata={"tts": {"voice": voice, "model": model, "format": fmt}},
    )


def run_pinpoint_generation(
    project_id: str,
    *,
    question_count: int = 10,
) -> list[dict[str, Any]]:
    return generate_and_save_pinpoint_questions(
        project_id=project_id,
        question_count=question_count,
    )


def run_architecture_generation(project_id: str) -> dict[str, Any]:
    return generate_and_save_architecture(project_id)

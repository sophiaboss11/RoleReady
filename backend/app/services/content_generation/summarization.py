import logging
from datetime import datetime
from typing import Any, Dict, List

from app.core.exceptions import DomainError, ExternalServiceError, InfraError
from app.core.gemini import generate_content_or_raise
from app.repositories.factory import build_content_repository
from app.services.content_generation.queries import (
    get_project_summary_record,
    list_project_embedding_rows,
)

logger = logging.getLogger(__name__)

SUMMARY_MODEL = "gemini-2.5-pro"
SUMMARY_TEMPERATURE = 0.2
SUMMARY_MAX_OUTPUT_TOKENS = 1200
MAX_SUMMARY_SOURCE_CHARS = 50000
EMBEDDING_PAGE_SIZE = 500


def fetch_embeddings_from_db(project_id: str) -> List[Dict[str, Any]]:
    """Fetch all embeddings for a project using pagination to avoid OOM."""
    rows = list_project_embedding_rows(
        build_content_repository(),
        project_id,
        columns="content,metadata",
        page_size=EMBEDDING_PAGE_SIZE,
    )
    page_count = (len(rows) + EMBEDDING_PAGE_SIZE - 1) // EMBEDDING_PAGE_SIZE if rows else 0
    logger.info(
        "Fetched %d embeddings for project %s (pages: %d)",
        len(rows),
        project_id,
        page_count,
    )
    return rows


def extract_text_from_embeddings(embeddings: List[Dict[str, Any]]) -> str:
    """Extract source text from embedding rows."""
    texts: List[str] = []

    for emb in embeddings:
        metadata = emb.get("metadata") or {}

        # Prefer the normalized content column; fallback to metadata payloads.
        content = emb.get("content") or metadata.get("excerpt") or metadata.get("content") or ""
        if isinstance(content, str):
            normalized = content.strip()
            if normalized:
                texts.append(normalized)

    return "\n\n".join(texts)


def _build_summary_prompt(project_id: str, source_text: str, instruction: str) -> str:
    return "\n".join(
        [
            instruction,
            "Return plain text only (no markdown code fences).",
            "Structure the summary with these headings:",
            "1) Project purpose",
            "2) Core capabilities",
            "3) Architecture and technologies",
            "4) Risks and constraints",
            "5) Suggested next steps",
            "",
            f"Project ID: {project_id}",
            "",
            "Source text:",
            source_text,
        ]
    )


def generate_summary_with_gemini(text: str, project_id: str) -> str:
    """Generate project summary using Gemini via shared SDK client."""
    source_text = text.strip()
    if not source_text:
        return "No text available to summarize."

    if len(source_text) > MAX_SUMMARY_SOURCE_CHARS:
        logger.info(
            "Summary source text exceeds limit for project %s (%d chars). Truncating to %d chars.",
            project_id,
            len(source_text),
            MAX_SUMMARY_SOURCE_CHARS,
        )
        source_text = source_text[:MAX_SUMMARY_SOURCE_CHARS] + "\n\n...(truncated)"

    from app.services.content_generation.prompt_service import resolve_instruction
    instruction = resolve_instruction(project_id, "summary")
    prompt = _build_summary_prompt(project_id, source_text, instruction)

    try:
        return generate_content_or_raise(
            prompt,
            model=SUMMARY_MODEL,
            temperature=SUMMARY_TEMPERATURE,
            max_output_tokens=SUMMARY_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        logger.exception("Failed to generate summary for project %s: %s", project_id, exc)
        raise ExternalServiceError("AI summary generation failed") from exc


def save_summary_to_db(project_id: str, summary: str) -> bool:
    """Upsert project summary in DB."""
    try:
        build_content_repository().upsert_project_summary(
            project_id=project_id,
            summary=summary,
            updated_at=datetime.utcnow().isoformat(),
        )

        logger.info("Saved summary for project %s", project_id)
        return True
    except Exception as exc:
        logger.exception("Failed to save summary for project %s: %s", project_id, exc)
        raise InfraError(f"Failed to save summary for project {project_id}") from exc

def summarize_embeddings(project_id: str) -> Dict[str, Any]:
    """Generate summary for all embeddings in a project and persist it."""
    embeddings = fetch_embeddings_from_db(project_id)

    if not embeddings:
        raise DomainError(
            f"No embeddings found for project_id: {project_id}. Run ingestion before generating a summary."
        )

    text = extract_text_from_embeddings(embeddings)
    summary = generate_summary_with_gemini(text, project_id)
    save_success = save_summary_to_db(project_id, summary)

    return {
        "summary": summary,
        "embeddings_count": len(embeddings),
        "project_id": project_id,
        "saved_to_db": save_success,
    }

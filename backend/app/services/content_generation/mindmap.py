"""Mindmap generation service using Supabase (pgvector) + Gemini.

Service layer only (no FastAPI imports).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.core.exceptions import DomainError, ExternalServiceError, InfraError, ValidationError
from app.core.gemini import generate_content_or_raise
from app.services.content_generation.retrieval import build_context_text, retrieve_project_context

_GENERATION_MODEL = "gemini-2.5-pro"
_GENERATION_TEMPERATURE = 0.3
_GENERATION_MAX_OUTPUT_TOKENS = 800


def _build_mermaid_prompt(query: str, context: str, instruction: str) -> str:
    return "\n".join(
        [
            instruction,
            "Output contract (strict):",
            "- Your response MUST be Mermaid notation only.",
            "- The first non-empty line MUST be exactly: mindmap",
            "- The second non-empty line MUST define the root node in this form: `  root((...))`",
            "- Use valid Mermaid mindmap syntax only.",
            "- Do NOT output Markdown code fences.",
            "- Do NOT output explanations, headings, or any non-Mermaid prose.",
            "- Do NOT include source annotations or metadata tags (e.g. `[src:...]`, `chunk:...`, `doc:...`).",
            "Keep labels short. Prefer 2-4 levels deep. Avoid special characters that often break parsing.",
            "",
            f"User request: {query}",
            "",
            "Relevant context snippets:",
            context or "(no context)",
            "",
            "Now return ONLY the Mermaid mindmap text:",
        ]
    )


def gemini_generate_mermaid(query: str, context: str, instruction: str) -> str:
    """Generate Mermaid mindmap text via shared Gemini SDK client."""
    prompt = _build_mermaid_prompt(query, context, instruction)

    try:
        mermaid = generate_content_or_raise(
            prompt,
            model=_GENERATION_MODEL,
            temperature=_GENERATION_TEMPERATURE,
            max_output_tokens=_GENERATION_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        raise ExternalServiceError(f"Failed to generate Mermaid mindmap: {exc}") from exc

    # Strip accidental code fences, just in case.
    normalized = mermaid.strip()
    if normalized.lower().startswith("```"):
        normalized = normalized.replace("```mermaid", "```")
        normalized = normalized.lstrip("` ").lstrip()
    if normalized.endswith("```"):
        normalized = normalized[:-3].strip()

    if not normalized:
        raise ExternalServiceError("Gemini returned empty Mermaid text")

    return normalized
def generate_mindmap(
    *,
    query: str,
    max_docs: int = 6,
    project_id: Optional[str] = None,
    require_context: bool = True,
) -> Dict[str, Any]:
    """Generate a Mermaid mindmap string.

    Returns:
      {"mermaid": str, "retrievedCount": int, "warning": str|None, "sources": [{"id": str}, ...]}
    """

    query = (query or "").strip()
    if not query:
        raise ValidationError("Missing query")

    settings = get_settings()
    if not settings.gemini_api_key:
        raise InfraError("Missing GEMINI_API_KEY")

    max_docs_int = max(1, min(12, int(max_docs)))

    match_docs = retrieve_project_context(
        query=query,
        project_id=project_id,
        max_docs=max_docs_int,
    )

    if require_context and len(match_docs) == 0:
        raise DomainError(
            "No embedding context found for this query. This usually means either the embeddings table is empty for the given project_id, "
            "or your query embedding model/dimension does not match the stored vectors."
        )

    context = build_context_text(match_docs)

    from app.services.content_generation.prompt_service import resolve_instruction
    instruction = resolve_instruction(project_id or "", "mindmap")
    mermaid = gemini_generate_mermaid(query, context, instruction)

    warning = (
        "Generated mindmap without retrieved embedding context (no matches returned)."
        if len(match_docs) == 0
        else None
    )

    return {
        "mermaid": mermaid,
        "retrievedCount": len(match_docs),
        "warning": warning,
        "sources": [{"id": (doc.document_id or doc.id)} for doc in match_docs],
    }

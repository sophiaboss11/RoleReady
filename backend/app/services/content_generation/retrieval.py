from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError, InfraError
from app.core.gemini import embed_text_or_raise
from app.repositories.factory import build_content_repository

DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"


@dataclass(frozen=True)
class MatchDoc:
    id: str
    content: str
    source: str | None
    document_id: str | None
    chunk_index: int | None
    metadata: Any
    similarity: float


def retrieve_project_context(
    *,
    query: str,
    project_id: str | None,
    max_docs: int,
) -> list[MatchDoc]:
    settings = get_settings()
    embedding_model = settings.gemini_embedding_model or DEFAULT_EMBEDDING_MODEL
    output_dimensionality = settings.gemini_embedding_output_dimensionality

    if not embedding_model:
        raise InfraError("Missing Gemini embedding model configuration")
    if output_dimensionality <= 0:
        raise InfraError("GEMINI_EMBEDDING_OUTPUT_DIMENSIONALITY must be positive")

    try:
        embedding = embed_text_or_raise(
            query,
            model=embedding_model,
            output_dimensionality=output_dimensionality,
            task_type="RETRIEVAL_QUERY",
        )
    except Exception as exc:
        message = str(exc)
        if "not found" in message.lower() or "404" in message:
            raise ExternalServiceError(
                f"Gemini embedding model '{embedding_model}' is unavailable for embedContent."
            ) from exc
        raise ExternalServiceError(f"Failed to generate Gemini embedding: {message}") from exc

    data = build_content_repository().match_embedding(
        query_embedding=embedding,
        match_count=max_docs,
        filter_project_id=project_id,
    )

    docs: list[MatchDoc] = []
    for row in data:
        source = row.get("source")
        document_id = row.get("document_id")
        chunk_index = row.get("chunk_index")
        docs.append(
            MatchDoc(
                id=str(row.get("id", "")),
                content=str(row.get("content", "")),
                source=None if source is None else str(source),
                document_id=None if document_id is None else str(document_id),
                chunk_index=None if chunk_index is None else int(chunk_index),
                metadata=row.get("metadata"),
                similarity=float(row.get("similarity", 0.0)),
            )
        )

    return docs


def build_context_text(docs: list[MatchDoc]) -> str:
    blocks: list[str] = []
    for index, doc in enumerate(docs, start=1):
        header_parts: list[str] = []
        if doc.source:
            header_parts.append(f"src:{doc.source}")
        if doc.document_id:
            header_parts.append(f"doc:{doc.document_id}")
        if doc.chunk_index is not None:
            header_parts.append(f"chunk:{doc.chunk_index}")

        header = " ".join(header_parts) if header_parts else doc.id
        blocks.append(f"[{index}] {header}\n{doc.content}")

    return "\n\n".join(blocks)

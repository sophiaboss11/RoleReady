from __future__ import annotations

import uuid
from typing import Any, Sequence

from app.core.embeddings import EMBEDDING_MODEL, embed_batch_with_retries
from app.core.exceptions import ExternalServiceError, InfraError
from app.models.embedding import Embedding
from app.repositories.ingestion_repository import EmbeddingRepository


def delete_embeddings_for_scope(
    repo: EmbeddingRepository,
    *,
    project_id: str | None = None,
    source: str | None = None,
    document_ids: list[str] | None = None,
) -> None:
    repo.delete_for_scope(
        project_id=project_id,
        source=source,
        document_ids=document_ids,
    )


def insert_embedding_rows(
    repo: EmbeddingRepository,
    rows: list[dict[str, Any]],
) -> int:
    return repo.insert_rows(rows)


def build_remote_embedding_rows(
    batch: Sequence[Any],
    *,
    project_id: str | None,
    source: str,
) -> list[dict[str, Any]]:
    texts = [doc.page_content for doc in batch]
    try:
        embeddings = embed_batch_with_retries(texts)
    except Exception as exc:
        raise ExternalServiceError(
            f"Failed to generate embeddings for {source} content with model '{EMBEDDING_MODEL}': {exc}"
        ) from exc

    rows: list[dict[str, Any]] = []
    for index, (doc, embedding) in enumerate(zip(batch, embeddings)):
        metadata = dict(doc.metadata or {})

        record = Embedding(
            id=uuid.uuid4(),
            vectors=embedding,
            chunk_index=doc.metadata.get("start_index", index) if doc.metadata else index,
            metadata=metadata,
            project_id=project_id,
            document_id=None,
            source=source,
            content=doc.page_content,
        )
        rows.append(record.model_dump(mode="json"))
    return rows


def raise_if_no_embeddings_saved(
    *,
    inserted: int,
    doc_count: int,
    batch_count: int,
    embed_errors: int,
    db_errors: int,
    source_label: str,
) -> None:
    if inserted > 0 or doc_count == 0:
        return

    if embed_errors >= batch_count and batch_count > 0:
        raise ExternalServiceError(
            f"Embedding generation failed for all {batch_count} batches while processing {source_label}. "
            f"Check the embedding provider configuration for model '{EMBEDDING_MODEL}'."
        )

    if db_errors >= batch_count and batch_count > 0:
        raise InfraError(
            f"All {db_errors} database inserts failed while processing {source_label}."
        )

    if embed_errors > 0 and db_errors == 0:
        raise ExternalServiceError(
            f"No embeddings were saved for {source_label} because every successful fetch failed during embedding generation."
        )

    if db_errors > 0 and embed_errors == 0:
        raise InfraError(
            f"No embeddings were saved for {source_label} because every prepared batch failed to persist."
        )

    raise InfraError(
        f"Ingestion produced {doc_count} chunks for {source_label} but 0 were saved to the database."
    )

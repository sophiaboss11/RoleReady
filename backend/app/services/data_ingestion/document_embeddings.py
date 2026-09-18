import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List

from app.core.embeddings import chunked, embed_batch_with_retries
from app.core.exceptions import ExternalServiceError, InfraError, NotFoundError, ValidationError
from app.models.embedding import Embedding
from app.repositories.factory import build_document_repository, build_embedding_repository
from app.repositories.ingestion_repository import DocumentRepository, EmbeddingRepository
from app.services.data_ingestion.common import (
    delete_embeddings_for_scope,
    insert_embedding_rows,
    raise_if_no_embeddings_saved,
)

logger = logging.getLogger(__name__)

# ---------- CONFIG ----------
BATCH_SIZE = 32
MAX_WORKERS = 4
# EMBEDDING_MODEL managed in app.core.embeddings
# SUPABASE_URL/KEY managed in app.core.supabase
DOCUMENT_FETCH_LIMIT = 1000   # safety cap per run
# ----------------------------

def fetch_unprocessed_documents(
    repo: DocumentRepository,
    project_id: str | None = None,
    document_ids: list[str] | None = None,
    limit: int = DOCUMENT_FETCH_LIMIT,
    ignore_processed: bool = False,
):
    """
    Returns a list of document dicts from RoleReady.documents.
    If ignore_processed=True, processed status is ignored (for re-ingestion).
    """
    return repo.list_documents(
        project_id=project_id,
        document_ids=document_ids,
        limit=limit,
        ignore_processed=ignore_processed,
    )

def prepare_embedding_rows_from_documents(docs_batch):
    """
    Given a batch of document dicts (each with id, project_id, content, chunk_index, metadata),
    return a list of dicts matching the Embedding model JSON shape.
    """
    texts = []
    doc_ids = []
    chunk_indexes = []
    metadatas = []
    project_ids = []
    for d in docs_batch:
        # If a document's content is large / needs chunking, split here and return multiple embedding rows.
        # For now we assume documents are pre-chunked.
        texts.append(d.get("content") or "")
        doc_ids.append(d["id"])
        chunk_indexes.append(d.get("chunk_index", 0))
        metadatas.append(d.get("metadata") or {})
        project_ids.append(d.get("project_id"))

    # embed
    try:
        embeddings = embed_batch_with_retries(texts)
    except Exception as exc:
        raise ExternalServiceError(f"Failed to generate embeddings for uploaded documents: {exc}") from exc

    rows = []
    for doc_id, proj_id, ck, meta, emb, content_text in zip(doc_ids, project_ids, chunk_indexes, metadatas, embeddings, texts):
        emb_id = uuid.uuid4()
        # normalize metadata: keep excerpt small for storage
        meta = dict(meta) if meta else {}
        if "excerpt" not in meta:
            meta["excerpt"] = content_text[:512]
        
        # Determine source: use metadata 'source' if available, else default to 'uploads'
        source_val = meta.get("source", "uploads")

        embedding_record = Embedding(
            id=emb_id,
            project_id=uuid.UUID(proj_id) if proj_id else None,
            vectors=emb,
            chunk_index=ck,
            metadata=meta,
            document_id=uuid.UUID(doc_id),
            source=source_val,
            content=content_text
        )
        # model_dump(mode='json') yields JSON-serializable dict (UUIDs will be stringified)
        rows.append(embedding_record.model_dump(mode="json"))
    return rows, doc_ids

def mark_documents_processed(repo: DocumentRepository, doc_ids: List[str]) -> None:
    repo.mark_processed(doc_ids)


def process_documents_for_project(project_id=None, document_ids=None):
    if document_ids and not project_id:
        raise ValidationError("project_id is required when document_ids are provided")

    document_repo = build_document_repository()
    embedding_repo = build_embedding_repository()

    if document_ids:
        logger.info("Deleting embeddings for %d documents...", len(document_ids))
    elif project_id:
        logger.info("Deleting all 'uploads' embeddings for project %s...", project_id)
    delete_embeddings_for_scope(
        embedding_repo,
        project_id=project_id,
        source=None if document_ids else "uploads",
        document_ids=document_ids,
    )

    # 2. Fetch documents (force fetch even if processed, since we just deleted embeddings)
    # If document_ids provided, we definitely want those.
    # If project_id provided without doc_ids, user implies "convert ALL documents".
    # So we set ignore_processed=True.
    docs = fetch_unprocessed_documents(
        document_repo,
        project_id=project_id,
        document_ids=document_ids,
        ignore_processed=True,
    )
    if not docs:
        logger.warning("No documents found to process.")
        return 0

    # Prepare batches (each batch is a list of docs)
    batches = list(chunked(docs, BATCH_SIZE))
    inserted_total = 0
    embed_errors = 0
    db_errors = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        future_to_batch_idx = {ex.submit(prepare_embedding_rows_from_documents, b): i for i, b in enumerate(batches)}
        for fut in as_completed(future_to_batch_idx):
            batch_idx = future_to_batch_idx[fut]
            try:
                rows, doc_ids = fut.result()
            except ExternalServiceError as exc:
                embed_errors += 1
                logger.error("[batch %d] prepare failed: %s", batch_idx, exc)
                continue

            if not rows:
                logger.warning("[batch %d] no rows prepared, skipping", batch_idx)
                continue

            # insert to embeddings table
            try:
                insert_embedding_rows(embedding_repo, rows)
                inserted_total += len(rows)
                logger.info("[batch %d] inserted %d embeddings (total=%d)", batch_idx, len(rows), inserted_total)
            except InfraError as exc:
                if "23503" in str(exc) and "project" in str(exc):
                    logger.warning("Project %s deleted during ingestion. Aborting Document ingestion.", project_id)
                    ex.shutdown(wait=False, cancel_futures=True)
                    raise NotFoundError(f"Project {project_id} deleted")
                db_errors += 1
                logger.error("[batch %d] DB insert failed: %s", batch_idx, exc)
                # do not mark docs processed; they will be retried later
                continue

            # mark original documents processed
            mark_documents_processed(document_repo, doc_ids)

    raise_if_no_embeddings_saved(
        inserted=inserted_total,
        doc_count=len(docs),
        batch_count=len(batches),
        embed_errors=embed_errors,
        db_errors=db_errors,
        source_label=f"uploaded documents for project {project_id}",
    )

    return inserted_total

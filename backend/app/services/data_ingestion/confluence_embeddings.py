"""
Confluence data ingestion service.
Fetches Confluence pages, converts to plaintext, chunks, creates embeddings, and stores in PGVector.
"""
import os
import time
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
from atlassian import Confluence
import html2text
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.embeddings import chunked
from app.core.exceptions import ExternalServiceError, InfraError
from app.repositories.factory import build_embedding_repository
from app.services.data_ingestion.common import (
    build_remote_embedding_rows,
    delete_embeddings_for_scope,
    insert_embedding_rows,
    raise_if_no_embeddings_saved,
)

load_dotenv()
logger = logging.getLogger(__name__)

# ---------- CONFIG ----------
CONFLUENCE_URL = os.getenv("CONFLUENCE_URL")
CONFLUENCE_EMAIL = os.getenv("CONFLUENCE_EMAIL")
CONFLUENCE_API_TOKEN = os.getenv("CONFLUENCE_API_TOKEN")
BATCH_SIZE = 32
# EMBEDDING_MODEL managed in app.core.embeddings
# SUPABASE_URL/KEY managed in app.core.supabase
# ----------------------------

def get_confluence_client() -> Confluence:
    """Initialize and return Confluence client."""
    if not all([CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN]):
        raise InfraError(
            "Confluence credentials not configured. Set CONFLUENCE_URL, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN environment variables."
        )
    return Confluence(
        url=CONFLUENCE_URL,
        username=CONFLUENCE_EMAIL,
        password=CONFLUENCE_API_TOKEN,
        cloud=True
    )


def confluence_to_plaintext(html_content: str) -> str:
    """Convert Confluence HTML/storage format to plaintext."""
    if not html_content:
        return ""
    
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = True
    h.body_width = 0  # Don't wrap lines
    return h.handle(html_content).strip()


def fetch_confluence_page_content(confluence_client: Confluence, page_id: str) -> Dict[str, Any]:
    """Fetch and parse a single Confluence page."""
    try:
        page = confluence_client.get_page_by_id(
            page_id,
            expand="body.storage,version,space,ancestors"
        )
        
        title = page.get("title", "")
        body_html = page.get("body", {}).get("storage", {}).get("value", "")
        body_text = confluence_to_plaintext(body_html)
        
        full_content = f"Page: {title}\n\n{body_text}"
        
        space = page.get("space", {})
        version_info = page.get("version", {})
        
        base_url = CONFLUENCE_URL.rstrip("/wiki")
        page_url = f"{base_url}/wiki/spaces/{space.get('key', '')}/pages/{page_id}"
        
        metadata = {
            "page_id": page_id,
            "title": title,
            "source_url": page_url,
            "space_key": space.get("key", ""),
            "space_name": space.get("name", ""),
            "version": version_info.get("number", 1),
            "created_by": version_info.get("by", {}).get("displayName", ""),
            "last_updated": version_info.get("when", "")
        }
        
        return {
            "content": full_content,
            "metadata": metadata
        }
    except Exception as exc:
        raise ExternalServiceError(f"Failed to fetch Confluence page {page_id}: {exc}") from exc


def fetch_confluence_pages_for_space(confluence_client: Confluence, space_key: str, max_results: int = 1000) -> List[Dict[str, Any]]:
    """Fetch all pages in a Confluence space."""
    logger.info("Fetching Confluence pages for space %s...", space_key)
    start = 0
    limit = 50
    all_pages = []
    
    while start < max_results:
        try:
            result = confluence_client.get_all_pages_from_space(
                space=space_key,
                start=start,
                limit=limit,
                expand="version"
            )
            if not result:
                break
            
            for page in result:
                page_id = page["id"]
                try:
                    page_data = fetch_confluence_page_content(confluence_client, page_id)
                    all_pages.append(page_data)
                except ExternalServiceError as exc:
                    logger.warning("Skipping page %s due to error: %s", page_id, exc)
            
            start += len(result)
            if len(result) < limit:
                break
        except Exception as exc:
            raise ExternalServiceError(
                f"Failed to fetch Confluence pages for space {space_key} at offset {start}: {exc}"
            ) from exc
            
    logger.info("Fetched %d total pages from Confluence", len(all_pages))
    return all_pages


def process_batch(batch, project_id):
    """Embed and prepare rows for Supabase insertion."""
    return build_remote_embedding_rows(batch, project_id=project_id, source="confluence")


def process_confluence_space(project_id: str, space_key: str):
    """
    Main function to process all Confluence pages in a space sequentially.
    Matches the pattern and payload of github_embeddings.py.
    """
    logger.info("Starting Confluence ingestion for space %s (project_id=%s)", space_key, project_id)
    embedding_repo = build_embedding_repository()

    logger.info("Deleting existing 'confluence' embeddings for project %s...", project_id)
    delete_embeddings_for_scope(embedding_repo, project_id=project_id, source="confluence")

    start = time.time()
    
    # Init client
    confluence_client = get_confluence_client()
    
    # 2. Fetch content
    pages = fetch_confluence_pages_for_space(confluence_client, space_key)

    if not pages:
        logger.warning("No pages found in Confluence space %s", space_key)
        return {"inserted_count": 0, "elapsed_seconds": time.time() - start}

    # 3. Chunk content using standard text splitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        add_start_index=True
    )
    
    docs = []
    for page in pages:
        page_docs = text_splitter.create_documents(
            [page["content"]], 
            metadatas=[page["metadata"]]
        )
        docs.extend(page_docs)
        
    logger.info("Created %d document chunks", len(docs))

    # 4. Prepare batches
    batches = list(chunked(docs, BATCH_SIZE))
    logger.info("Prepared %d batches (batch_size=%d)", len(batches), BATCH_SIZE)

    inserted = 0
    embed_errors = 0
    db_errors = 0

    # 5. Process sequentially
    for i, batch in enumerate(batches):
        try:
            rows = process_batch(batch, project_id)
        except ExternalServiceError as exc:
            embed_errors += 1
            logger.error("[batch %d] embedding failed: %s", i, exc)
            continue

        try:
            if rows:
                inserted_count = insert_embedding_rows(embedding_repo, rows)
                inserted += inserted_count
                logger.info("[batch %d] inserted %d rows (total=%d)", i, inserted_count, inserted)
        except InfraError as exc:
            db_errors += 1
            logger.error("[batch %d] DB insert failed: %s", i, exc)

    end = time.time()
    elapsed = end - start
    logger.info("Done. Inserted %d rows in %.2fs (embed_errors=%d, db_errors=%d)", inserted, elapsed, embed_errors, db_errors)

    raise_if_no_embeddings_saved(
        inserted=inserted,
        doc_count=len(docs),
        batch_count=len(batches),
        embed_errors=embed_errors,
        db_errors=db_errors,
        source_label=f"confluence space {space_key}",
    )

    return {"inserted_count": inserted, "elapsed_seconds": elapsed}

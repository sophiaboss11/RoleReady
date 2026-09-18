"""
Jira data ingestion service.
Fetches Jira issues, converts to plaintext, chunks, creates embeddings, and stores in PGVector.
"""
import os
import time
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
from atlassian import Jira
import html2text
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.embeddings import chunked
from app.core.exceptions import ExternalServiceError, InfraError, NotFoundError
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
JIRA_URL = os.getenv("JIRA_URL")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
BATCH_SIZE = 32
# EMBEDDING_MODEL managed in app.core.embeddings
# SUPABASE_URL/KEY managed in app.core.supabase
# ----------------------------

def get_jira_client() -> Jira:
    """Initialize and return Jira client."""
    if not all([JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN]):
        raise InfraError(
            "Jira credentials not configured. Set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN environment variables."
        )
        
    # Validate credentials early to prevent silent '0 issues' bug from anonymous fallback
    import requests
    res = requests.get(
        f"{JIRA_URL}/rest/api/3/myself",
        auth=(JIRA_EMAIL, JIRA_API_TOKEN),
        headers={"Accept": "application/json"}
    )
    if res.status_code == 401:
        raise InfraError(f"Jira authentication failed (401 Unauthorized) for {JIRA_EMAIL}. Please check JIRA_API_TOKEN in .env.")
        
    return Jira(
        url=JIRA_URL,
        username=JIRA_EMAIL,
        password=JIRA_API_TOKEN,
        cloud=True
    )


def adf_to_plaintext(adf_content: Any) -> str:
    """Convert Atlassian Document Format (ADF) to plaintext."""
    if not adf_content:
        return ""
    
    # If it's already a string, treat as HTML and convert
    if isinstance(adf_content, str):
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = True
        return h.handle(adf_content).strip()
    
    # If it's ADF JSON, recursively extract text
    if isinstance(adf_content, dict):
        text_parts = []
        if adf_content.get("type") == "text":
            text_parts.append(adf_content.get("text", ""))
        if "content" in adf_content:
            for node in adf_content["content"]:
                text_parts.append(adf_to_plaintext(node))
        return " ".join(text_parts).strip()
    
    if isinstance(adf_content, list):
        return " ".join(adf_to_plaintext(item) for item in adf_content).strip()
    
    return str(adf_content)


def fetch_jira_issue_content(jira_client: Jira, issue_key: str) -> Dict[str, Any]:
    """Fetch and parse a single Jira issue."""
    try:
        issue = jira_client.issue(issue_key, expand="renderedFields")
        fields = issue["fields"]
        
        summary = fields.get("summary", "")
        description = adf_to_plaintext(fields.get("description", ""))
        
        comments = []
        if "comment" in fields and "comments" in fields["comment"]:
            for comment in fields["comment"]["comments"]:
                comment_text = adf_to_plaintext(comment.get("body", ""))
                author = comment.get("author", {}).get("displayName", "Unknown")
                comments.append(f"Comment by {author}: {comment_text}")
        
        content_parts = [
            f"Issue: {issue_key}",
            f"Summary: {summary}",
            f"\nDescription:\n{description}"
        ]
        if comments:
            content_parts.append(f"\nComments:\n" + "\n\n".join(comments))
        
        full_content = "\n".join(content_parts)
        
        metadata = {
            "issue_key": issue_key,
            "summary": summary,
            "source_url": f"{JIRA_URL}/browse/{issue_key}",
            "issue_type": fields.get("issuetype", {}).get("name", ""),
            "status": fields.get("status", {}).get("name", ""),
            "priority": fields.get("priority", {}).get("name", ""),
            "created": fields.get("created", ""),
            "updated": fields.get("updated", "")
        }
        
        return {
            "content": full_content,
            "metadata": metadata
        }
    except Exception as exc:
        raise ExternalServiceError(f"Failed to fetch Jira issue {issue_key}: {exc}") from exc


def fetch_jira_issues_for_project(jira_client: Jira, project_key: str, max_results: int = 1000) -> List[Dict[str, Any]]:
    """Fetch all issues for a Jira project."""
    jql = f"project = {project_key} ORDER BY created DESC"
    start_at = 0
    max_per_request = 50
    all_issues = []
    
    logger.info("Fetching Jira issues for project %s...", project_key)
    import requests
    
    while start_at < max_results:
        try:
            # Send GET request manually to avoid atlassian-python-api broken POST payload
            res = requests.get(
                f"{jira_client.url}/rest/api/3/search/jql",
                auth=(jira_client.username, jira_client.password),
                headers={"Accept": "application/json"},
                params={
                    "jql": jql,
                    "startAt": start_at,
                    "maxResults": max_per_request,
                    "fields": "key"
                }
            )
            
            if res.status_code == 401:
                raise ExternalServiceError("Jira Authentication failed (401 Unauthorized). Check JIRA_EMAIL and JIRA_API_TOKEN in .env")
            if res.status_code == 404:
                raise ExternalServiceError(f"Project '{project_key}' not found or no permissions (404 Not Found).")
            
            # Since GET /rest/api/3/search/jql permits anonymous access and returns 0 issues,
            # we want to double check if auth fails or there's really no issues.
            res.raise_for_status()
            
            results = res.json()
            issues = results.get("issues", [])
            if not issues:
                break
            
            for issue in issues:
                issue_key = issue["key"]
                try:
                    issue_data = fetch_jira_issue_content(jira_client, issue_key)
                    all_issues.append(issue_data)
                except ExternalServiceError as exc:
                    logger.warning("Skipping issue %s due to error: %s", issue_key, exc)
            
            start_at += len(issues)
            if len(issues) < max_per_request:
                break
        except Exception as exc:
            raise ExternalServiceError(
                f"Failed to fetch Jira issues for project {project_key} at offset {start_at}: {exc}"
            ) from exc
            
    logger.info("Fetched %d total issues from Jira", len(all_issues))
    return all_issues


def process_batch(batch, project_id):
    """Embed and prepare rows for Supabase insertion."""
    return build_remote_embedding_rows(batch, project_id=project_id, source="jira")


def process_jira_project(project_id: str, jira_project_key: str):
    """
    Main function to process all Jira issues for a project sequentially.
    Matches the pattern and payload of github_embeddings.py.
    """
    logger.info("Starting Jira ingestion for %s (project_id=%s)", jira_project_key, project_id)
    embedding_repo = build_embedding_repository()

    logger.info("Deleting existing 'jira' embeddings for project %s...", project_id)
    delete_embeddings_for_scope(embedding_repo, project_id=project_id, source="jira")

    start = time.time()
    
    # Init client
    jira_client = get_jira_client()
    
    # 2. Fetch content
    issues = fetch_jira_issues_for_project(jira_client, jira_project_key)

    if not issues:
        logger.warning("No issues found in Jira project %s", jira_project_key)
        return {"inserted_count": 0, "elapsed_seconds": time.time() - start}

    # 3. Chunk content using standard text splitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        add_start_index=True
    )
    
    docs = []
    for issue in issues:
        # Generate generic Document objects matching Langchain split
        issue_docs = text_splitter.create_documents(
            [issue["content"]], 
            metadatas=[issue["metadata"]]
        )
        docs.extend(issue_docs)
        
    logger.info("Created %d document chunks", len(docs))

    # 4. Prepare batches
    batches = list(chunked(docs, BATCH_SIZE))
    logger.info("Prepared %d batches (batch_size=%d)", len(batches), BATCH_SIZE)

    inserted = 0
    embed_errors = 0
    db_errors = 0

    # 5. Process sequentially (skipping threads as requested)
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
            if "23503" in str(exc) and "project" in str(exc):
                logger.warning("Project %s deleted during ingestion. Aborting Jira.", project_id)
                raise NotFoundError(f"Project {project_id} deleted")
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
        source_label=f"jira project {jira_project_key}",
    )

    return {"inserted_count": inserted, "elapsed_seconds": elapsed}

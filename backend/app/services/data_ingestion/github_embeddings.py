import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from gitingest import ingest
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

logger = logging.getLogger(__name__)

# ---------- CONFIG ----------
BATCH_SIZE = 32        # tune: 16 / 32 / 64
MAX_WORKERS = 4        # tune by CPU / Ollama setup
CHUNK_SIZE = 2000      # larger chunks = fewer, more coherent embeddings
CHUNK_OVERLAP = 150
MAX_CHUNKS = 80        # cap to prevent huge repos from overwhelming token budgets
# ----------------------------

# File patterns to EXCLUDE from ingestion (low-value for understanding project logic)
_EXCLUDE_PATTERNS = {
    # Stylesheets
    "*.css", "*.scss", "*.sass", "*.less",
    # Minified / bundled assets
    "*.min.js", "*.min.css", "*.bundle.js", "*.chunk.js",
    # Lock files & dependency manifests
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Pipfile.lock",
    "poetry.lock", "composer.lock", "Gemfile.lock",
    # Images & binary
    "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico", "*.svg", "*.webp",
    "*.woff", "*.woff2", "*.ttf", "*.eot",
    # Compiled / build artifacts
    "*.pyc", "*.pyo", "*.class", "*.o", "*.so", "*.dll",
    # Data / config noise
    "*.map", "*.log",
    # IDE / editor
    ".vscode/*", ".idea/*",
}


def _clean_content(raw: str) -> str:
    """Strip low-value syntactic noise from repo content before chunking.

    This reduces token usage downstream by removing HTML tags, CSS blocks,
    excessive whitespace, and file-boundary boilerplate that gitingest inserts.
    """
    text = raw

    # Remove HTML tags but keep inner text
    text = re.sub(r"<[^>]+>", " ", text)

    # Remove CSS rule blocks  { ... }  that may leak through
    text = re.sub(r"\{[^{}]{0,500}\}", " ", text)

    # Collapse long runs of whitespace / blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{4,}", "  ", text)

    # Remove common gitingest file-boundary markers that add noise
    text = re.sub(
        r"-{4,}\nFile: [^\n]+\n-{4,}",
        "\n",
        text,
    )

    return text.strip()


def process_batch(batch, project_id=None):
    return build_remote_embedding_rows(batch, project_id=project_id, source="github")


def _fetch_repo_content(repo_url: str, github_token: str | None = None) -> str:
    try:
        kwargs = {
            "exclude_patterns": _EXCLUDE_PATTERNS,
        }
        if github_token:
            kwargs["token"] = github_token
        _, _, content = ingest(repo_url, **kwargs)
    except Exception as exc:
        raise ExternalServiceError(f"Failed to ingest repo {repo_url}: {exc}") from exc
    return content

def process_github_repo(project_id, repo_url, github_token=None):
    logger.info("Starting ingestion for %s (project_id=%s)", repo_url, project_id)
    embedding_repo = build_embedding_repository()

    logger.info("Deleting existing 'github' embeddings for project %s...", project_id)
    delete_embeddings_for_scope(embedding_repo, project_id=project_id, source="github")

    start = time.time()
    raw_content = _fetch_repo_content(repo_url, github_token)

    # Clean content to reduce noise before chunking
    content = _clean_content(raw_content)
    logger.info(
        "Content cleaned: %d chars -> %d chars (%.0f%% reduction)",
        len(raw_content), len(content),
        (1 - len(content) / max(1, len(raw_content))) * 100,
    )

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        add_start_index=True,
    )

    # Chunk content
    docs = text_splitter.create_documents([content])
    logger.info("Created %d document chunks", len(docs))

    # Cap chunks to prevent embedding budget blow-up on large repos
    if len(docs) > MAX_CHUNKS:
        logger.warning(
            "Chunk count %d exceeds MAX_CHUNKS=%d. Truncating to first %d chunks.",
            len(docs), MAX_CHUNKS, MAX_CHUNKS,
        )
        docs = docs[:MAX_CHUNKS]

    # Prepare batches
    batches = list(chunked(docs, BATCH_SIZE))
    logger.info("Prepared %d batches (batch_size=%d)", len(batches), BATCH_SIZE)

    inserted = 0
    embed_errors = 0
    db_errors = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_batch, batch, project_id): i
            for i, batch in enumerate(batches)
        }

        for future in as_completed(futures):
            batch_idx = futures[future]
            try:
                rows = future.result()
            except ExternalServiceError as exc:
                embed_errors += 1
                logger.error("[batch %d] embedding failed: %s", batch_idx, exc)
                continue

            try:
                inserted_count = insert_embedding_rows(embedding_repo, rows)
                inserted += inserted_count
                logger.info("[batch %d] inserted %d rows (total=%d)", batch_idx, inserted_count, inserted)
            except InfraError as exc:
                if "23503" in str(exc) and "project" in str(exc):
                    logger.warning("Project %s deleted during ingestion. Aborting GitHub.", project_id)
                    executor.shutdown(wait=False, cancel_futures=True)
                    raise NotFoundError(f"Project {project_id} deleted")
                db_errors += 1
                logger.error("[batch %d] DB insert failed: %s", batch_idx, exc)

    end = time.time()
    elapsed = end - start
    logger.info("Done. Inserted %d rows in %.2fs (embed_errors=%d, db_errors=%d)", inserted, elapsed, embed_errors, db_errors)

    raise_if_no_embeddings_saved(
        inserted=inserted,
        doc_count=len(docs),
        batch_count=len(batches),
        embed_errors=embed_errors,
        db_errors=db_errors,
        source_label=f"github repo {repo_url}",
    )

    return {"inserted_count": inserted, "elapsed_seconds": elapsed}

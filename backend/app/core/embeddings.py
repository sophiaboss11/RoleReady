import logging
import time
import os
from typing import List, Any
from langchain_google_genai import GoogleGenerativeAIEmbeddings

logger = logging.getLogger(__name__)

from app.core.config import get_settings

# Configuration
EMBEDDING_MODEL = "models/gemini-embedding-001"
RETRY_ATTEMPTS = 3
RETRY_BACKOFF = 1.0

# Lazy initialization
_embeddings_model = None

def get_embedding_client():
    global _embeddings_model
    if _embeddings_model is None:
        settings = get_settings()
        api_key = settings.gemini_api_key or os.getenv("GOOGLE_API_KEY")
        _embeddings_model = GoogleGenerativeAIEmbeddings(
            model=EMBEDDING_MODEL, 
            google_api_key=api_key,
            # No longer artificially downsampling to 768 since our Postgres DB
            # has been migrated to handle 3072 dimension vectors
            dimensions=settings.gemini_embedding_output_dimensionality
        )
    return _embeddings_model


def chunked(iterable: Any, size: int):
    """Yield successive n-sized chunks from iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def embed_batch_with_retries(texts: List[str]) -> List[List[float]]:
    """
    Embed a batch of texts with retry logic.
    """
    client = get_embedding_client()
    last_exc = None
    
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            if hasattr(client, "embed_documents"):
                return client.embed_documents(texts)
            else:
                return [client.embed_query(t) for t in texts]
        except Exception as e:
            last_exc = e
            sleep_for = RETRY_BACKOFF * attempt
            logger.warning("[embed] failed attempt %d/%d, retrying in %.1fs: %s", attempt, RETRY_ATTEMPTS, sleep_for, e)
            time.sleep(sleep_for)
            
    if last_exc:
        raise last_exc
    return []

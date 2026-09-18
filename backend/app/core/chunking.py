"""
Shared text chunking utilities for all data ingestion services.
"""
from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import List
from langchain.schema import Document

def create_text_splitter(
    chunk_size: int = 3000,
    chunk_overlap: int = 600
) -> RecursiveCharacterTextSplitter:
    """
    Create a text splitter with sensible defaults.
    
    Args:
        chunk_size: Target size in characters (~750 tokens)
        chunk_overlap: Overlap between chunks (~20%)
    
    Returns:
        RecursiveCharacterTextSplitter instance
    """
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        add_start_index=True,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""]
    )

def chunk_text_with_metadata(
    text: str,
    metadata: dict,
    chunk_size: int = 3000,
    chunk_overlap: int = 600
) -> List[Document]:
    """
    Chunk text and preserve metadata across all chunks.
    
    Args:
        text: Text content to chunk
        metadata: Metadata to attach to each chunk
        chunk_size: Target chunk size in characters
        chunk_overlap: Overlap between chunks
    
    Returns:
        List of Document objects with chunked content
    """
    splitter = create_text_splitter(chunk_size, chunk_overlap)
    chunks = splitter.create_documents([text], metadatas=[metadata])
    return chunks
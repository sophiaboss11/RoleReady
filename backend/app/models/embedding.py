from uuid import UUID
from typing import Dict, List, Literal, Optional, Any
from pydantic import BaseModel

EmbeddingSource = Literal['github', 'jira', 'confluence', 'uploads']

class Embedding(BaseModel):
    id: UUID
    vectors: List[float]
    chunk_index: int
    metadata: Dict[str, Any]
    project_id: Optional[UUID] = None
    document_id: Optional[UUID] = None
    source: EmbeddingSource
    content: str

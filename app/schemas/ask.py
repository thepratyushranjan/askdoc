from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID

class AskRequest(BaseModel):
    query: str
    document_ids: Optional[List[UUID]] = None

class Citation(BaseModel):
    doc_id: UUID
    chunk_index: int

class AskResponse(BaseModel):
    answer: str
    citations: List[Citation]

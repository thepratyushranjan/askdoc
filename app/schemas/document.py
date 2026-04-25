from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from app.models.models import DocumentStatus

class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    status: DocumentStatus
    created_at: datetime

    class Config:
        from_attributes = True

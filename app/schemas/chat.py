from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from app.models.models import MessageRole

class MessageBase(BaseModel):
    role: MessageRole
    content: str

class MessageResponse(MessageBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class ConversationBase(BaseModel):
    document_id: UUID

class ConversationResponse(ConversationBase):
    id: UUID
    created_at: datetime
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    answer: str
    follow_ups: List[str] = []

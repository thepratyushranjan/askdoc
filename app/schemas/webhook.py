from pydantic import BaseModel, HttpUrl
from uuid import UUID
from datetime import datetime
from typing import Optional, Any, Dict
from app.models.webhook import WebhookEvent


class WebhookCreate(BaseModel):
    url: str
    event: WebhookEvent
    secret: Optional[str] = None


class WebhookResponse(BaseModel):
    id: UUID
    url: str
    event: WebhookEvent
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class WebhookListResponse(BaseModel):
    webhooks: list[WebhookResponse]


class WebhookPayload(BaseModel):
    """The JSON body sent to the registered webhook URL."""
    event: str
    document_id: str
    status: str
    timestamp: str
    data: Optional[Dict[str, Any]] = None

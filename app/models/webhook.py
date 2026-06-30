import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Enum as SQLEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WebhookEvent(str, enum.Enum):
    INGESTION_COMPLETED = "ingestion.completed"
    INGESTION_FAILED = "ingestion.failed"
    EXTRACTION_COMPLETED = "extraction.completed"
    AUDIT_COMPLETED = "audit.completed"


class Webhook(Base):
    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    url: Mapped[str] = mapped_column(String(2048))
    event: Mapped[WebhookEvent] = mapped_column(SQLEnum(WebhookEvent))
    secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

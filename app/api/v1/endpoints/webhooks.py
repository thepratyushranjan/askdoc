from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.webhook import Webhook
from app.schemas.webhook import WebhookCreate, WebhookResponse, WebhookListResponse

router = APIRouter()


@router.post("/webhooks", response_model=WebhookResponse, status_code=201)
async def register_webhook(
    payload: WebhookCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new webhook to receive async event notifications.

    Supported events:
    - `ingestion.completed` — fired when a document finishes processing.
    - `ingestion.failed` — fired when document processing fails.
    - `extraction.completed` — fired after structured extraction finishes.
    - `audit.completed` — fired after a risk audit finishes.
    """
    hook = Webhook(
        url=payload.url,
        event=payload.event,
        secret=payload.secret,
    )
    db.add(hook)
    await db.commit()
    await db.refresh(hook)
    return hook


@router.get("/webhooks", response_model=WebhookListResponse)
async def list_webhooks(db: AsyncSession = Depends(get_db)):
    """List all registered webhooks."""
    result = await db.execute(select(Webhook).order_by(Webhook.created_at.desc()))
    hooks = result.scalars().all()
    return WebhookListResponse(webhooks=hooks)


@router.delete("/webhooks/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Unregister a webhook."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    hook = result.scalar_one_or_none()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.delete(hook)
    await db.commit()

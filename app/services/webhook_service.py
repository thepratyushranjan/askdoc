"""Webhook delivery service.

Fires HTTP POST callbacks to all registered webhooks matching the given event.
Runs inside the Celery worker so it never blocks the API event loop.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID

import httpx
from sqlalchemy import select
from tenacity import retry, stop_after_attempt, wait_exponential

from app.models.webhook import Webhook, WebhookEvent
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

# Timeout for outbound webhook HTTP calls (connect, read)
WEBHOOK_TIMEOUT = httpx.Timeout(5.0, connect=3.0)


def _sign_payload(payload_bytes: bytes, secret: str) -> str:
    """Create an HMAC-SHA256 signature for payload verification."""
    return hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
async def _deliver_single(url: str, payload: dict, secret: Optional[str] = None):
    """POST the payload to a single webhook URL with retries."""
    body = json.dumps(payload)
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Webhook-Signature"] = _sign_payload(body.encode(), secret)

    async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT) as client:
        resp = await client.post(url, content=body, headers=headers)
        resp.raise_for_status()
    logger.info("Webhook delivered to %s — status %s", url, resp.status_code)


async def fire_webhooks(
    event: WebhookEvent,
    document_id: UUID,
    status: str,
    data: Optional[Dict[str, Any]] = None,
):
    """Look up all active webhooks for `event` and POST the payload to each.

    Failures on individual deliveries are logged but never crash the caller.
    """
    async with AsyncSessionLocal() as db:
        stmt = (
            select(Webhook)
            .where(Webhook.event == event, Webhook.is_active == True)  # noqa: E712
        )
        result = await db.execute(stmt)
        hooks = result.scalars().all()

    if not hooks:
        return

    payload = {
        "event": event.value,
        "document_id": str(document_id),
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }

    for hook in hooks:
        try:
            await _deliver_single(hook.url, payload, hook.secret)
        except Exception as exc:
            logger.warning(
                "Webhook delivery failed for %s → %s: %s",
                event.value,
                hook.url,
                exc,
            )

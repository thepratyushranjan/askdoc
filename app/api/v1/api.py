from fastapi import APIRouter
from app.api.v1.endpoints import documents, chat, ask, system, webhooks

api_router = APIRouter()
api_router.include_router(documents.router, tags=["ingest"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(ask.router, tags=["ask"])
api_router.include_router(system.router, tags=["system"])
api_router.include_router(webhooks.router, tags=["webhooks"])

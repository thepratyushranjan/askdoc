from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.db.session import get_db
from app.models.models import Conversation, Document, DocumentStatus
from app.schemas.chat import ConversationResponse, ChatRequest, ChatResponse
from app.services.qa_service import process_chat_message

router = APIRouter()

@router.post("/conversations/{document_id}", response_model=ConversationResponse)
async def create_conversation(
    document_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    # Verify document exists and is processed
    stmt = select(Document).where(Document.id == document_id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != DocumentStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Document must be fully processed before starting a chat.")
        
    new_conv = Conversation(document_id=document_id)
    db.add(new_conv)
    await db.commit()
    await db.refresh(new_conv)
    
    # Return as dict to avoid SQLAlchemy lazy loading the messages relationship
    return {
        "id": new_conv.id,
        "document_id": new_conv.document_id,
        "created_at": new_conv.created_at,
        "messages": []
    }

@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    stmt = select(Conversation).options(selectinload(Conversation.messages)).where(Conversation.id == conversation_id)
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@router.post("/conversations/{conversation_id}/ask", response_model=ChatResponse)
async def ask_question(
    conversation_id: UUID,
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    answer, follow_ups = await process_chat_message(db, conversation_id, request.message)
    return ChatResponse(answer=answer, follow_ups=follow_ups)

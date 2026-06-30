import json
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.ask import AskRequest, AskResponse
from app.services.ask_service import answer_query, stream_answer_query

router = APIRouter()

@router.post("/ask", response_model=AskResponse)
async def ask_question(
    request: AskRequest,
    db: AsyncSession = Depends(get_db)
):
    return await answer_query(db, request.query, request.document_ids)

@router.get("/ask/stream")
async def ask_question_stream(
    query: str = Query(...),
    document_ids: Optional[List[UUID]] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    async def sse_generator():
        async for text_chunk in stream_answer_query(db, query, document_ids):
            yield f"data: {json.dumps({'text': text_chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

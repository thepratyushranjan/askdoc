import json
from uuid import UUID
from typing import List, Optional, AsyncGenerator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from google import genai
from google.genai import types
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

from app.models.models import DocumentChunk
from app.schemas.ask import AskResponse, Citation
from app.services.prompts import RAG_SYSTEM_PROMPT

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def get_embedding_with_retry(query: str):
    client = genai.Client()
    response = client.models.embed_content(
        model='gemini-embedding-2',
        contents=query,
        config={"output_dimensionality": 768}
    )
    return response.embeddings[0].values

async def search_chunks(db: AsyncSession, query: str, document_ids: Optional[List[UUID]] = None, top_k: int = 5) -> List[DocumentChunk]:
    try:
        query_embedding = get_embedding_with_retry(query)
    except Exception as e:
        print(f"Embedding error: {e}")
        return []

    stmt = select(DocumentChunk).where(DocumentChunk.embedding != None)
    if document_ids:
        stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
    
    stmt = stmt.order_by(DocumentChunk.embedding.l2_distance(query_embedding)).limit(top_k)
    res = await db.execute(stmt)
    return list(res.scalars().all())

def format_context(chunks: List[DocumentChunk]) -> str:
    formatted = []
    for chunk in chunks:
        formatted.append(f"[Doc: {chunk.document_id}, Chunk: {chunk.chunk_index}]\n{chunk.content}")
    return "\n\n".join(formatted)

class InternalAskResponse(BaseModel):
    answer: str
    citations: List[Citation]

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def generate_content_with_retry(prompt: str):
    client = genai.Client()
    return client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=RAG_SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=InternalAskResponse,
            temperature=0.0
        ),
    )

async def answer_query(db: AsyncSession, query: str, document_ids: Optional[List[UUID]] = None) -> AskResponse:
    chunks = await search_chunks(db, query, document_ids)
    if not chunks and document_ids:
        # Fallback: Fetch first 5 chunks if no semantic matches found
        stmt_fallback = (
            select(DocumentChunk)
            .where(DocumentChunk.document_id.in_(document_ids))
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(5)
        )
        fallback_res = await db.execute(stmt_fallback)
        chunks = list(fallback_res.scalars().all())

    if not chunks:
        return AskResponse(answer="I don't know.", citations=[])

    context_str = format_context(chunks)
    prompt = f"Context:\n{context_str}\n\nQuestion: {query}"

    try:
        response = generate_content_with_retry(prompt)
        
        # Track metrics
        try:
            from app.api.v1.endpoints.system import METRICS
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                METRICS["llm_token_usage"] += response.usage_metadata.total_token_count
        except Exception:
            pass

        data = InternalAskResponse.model_validate_json(response.text)
        return AskResponse(answer=data.answer, citations=data.citations)
    except Exception as e:
        print(f"Error in answer_query: {e}")
        return AskResponse(answer=f"Error generating answer: {e}", citations=[])

async def stream_answer_query(db: AsyncSession, query: str, document_ids: Optional[List[UUID]] = None) -> AsyncGenerator[str, None]:
    chunks = await search_chunks(db, query, document_ids)
    if not chunks and document_ids:
        # Fallback: Fetch first 5 chunks if no semantic matches found
        stmt_fallback = (
            select(DocumentChunk)
            .where(DocumentChunk.document_id.in_(document_ids))
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(5)
        )
        fallback_res = await db.execute(stmt_fallback)
        chunks = list(fallback_res.scalars().all())

    if not chunks:
        yield "I don't know."
        return

    context_str = format_context(chunks)
    prompt = f"Context:\n{context_str}\n\nQuestion: {query}"

    client = genai.Client()
    try:
        response = client.models.generate_content_stream(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=RAG_SYSTEM_PROMPT,
                temperature=0.0
            )
        )
        for chunk in response:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        print(f"Error in stream_answer_query: {e}")
        yield f"Error generating answer stream: {e}"

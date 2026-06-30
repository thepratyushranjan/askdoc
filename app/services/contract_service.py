import json
from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from google import genai
from google.genai import types
from pydantic import ValidationError

from app.models.models import Document, DocumentChunk
from app.schemas.document import ExtractedData, AuditReport

class ExtractionError(Exception):
    pass

class AuditError(Exception):
    pass

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((ExtractionError, ValidationError)),
    reraise=True
)
async def _extract_with_llm(text: str) -> ExtractedData:
    client = genai.Client()
    prompt = "Extract the following contract metadata from the provided document text."
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, text],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ExtractedData,
            ),
        )
        # response.text is a JSON string matching the schema
        return ExtractedData.model_validate_json(response.text)
    except Exception as e:
        raise ExtractionError(f"LLM extraction failed: {e}")

async def extract_contract_data(db: AsyncSession, document_id: UUID) -> ExtractedData:
    # 1. Fetch document and check cache
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    
    if not document:
        raise ValueError(f"Document with ID {document_id} not found")
        
    if document.extracted_data:
        return ExtractedData.model_validate(document.extracted_data)
        
    # 2. Reconstruct text from chunks
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = chunks_result.scalars().all()
    
    if not chunks:
        raise ValueError(f"Document {document_id} has no processed text chunks")
        
    full_text = "\n".join([chunk.content for chunk in chunks])
    
    # 3. Call LLM
    extracted_data = await _extract_with_llm(full_text)
    
    # 4. Save to DB
    document.extracted_data = extracted_data.model_dump()
    document.extracted_at = datetime.utcnow()
    await db.commit()

    # 5. Fire webhook
    from app.services.webhook_service import fire_webhooks
    from app.models.webhook import WebhookEvent
    await fire_webhooks(
        event=WebhookEvent.EXTRACTION_COMPLETED,
        document_id=document_id,
        status="completed",
    )

    return extracted_data

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((AuditError, ValidationError)),
    reraise=True
)
async def _audit_with_llm(text: str) -> AuditReport:
    client = genai.Client()
    prompt = (
        "Act as an expert legal auditor. Review the following contract text. "
        "Identify risky clauses such as Unlimited Liability, Broad Indemnity, or Auto-Renewal. "
        "You must extract the exact quote as 'evidence'. "
        "Classify severity as 'High', 'Medium', or 'Low'."
    )
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, text],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AuditReport,
            ),
        )
        return AuditReport.model_validate_json(response.text)
    except Exception as e:
        raise AuditError(f"LLM audit failed: {e}")

async def audit_contract(db: AsyncSession, document_id: UUID) -> AuditReport:
    # 1. Fetch document and check cache
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    
    if not document:
        raise ValueError(f"Document with ID {document_id} not found")
        
    if document.audit_report:
        return AuditReport.model_validate(document.audit_report)
        
    # 2. Reconstruct text from chunks
    chunks_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = chunks_result.scalars().all()
    
    if not chunks:
        raise ValueError(f"Document {document_id} has no processed text chunks")
        
    full_text = "\n".join([chunk.content for chunk in chunks])
    
    # 3. Call LLM
    audit_report = await _audit_with_llm(full_text)
    
    # 4. Save to DB
    document.audit_report = audit_report.model_dump()
    document.audited_at = datetime.utcnow()
    await db.commit()

    # 5. Fire webhook
    from app.services.webhook_service import fire_webhooks
    from app.models.webhook import WebhookEvent
    await fire_webhooks(
        event=WebhookEvent.AUDIT_COMPLETED,
        document_id=document_id,
        status="completed",
    )

    return audit_report

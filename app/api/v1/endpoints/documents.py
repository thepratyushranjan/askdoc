import os
import shutil
from typing import List
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.models import Document, DocumentStatus
from app.schemas.document import DocumentResponse, IngestResponse, DocumentStatusResponse, DocumentIngestData
from app.core.config import settings
from app.services.document_service import process_document_task

router = APIRouter()

@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_documents(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    allowed_extensions = [".pdf", ".docx"]
    
    if not os.path.exists(settings.MEDIA_DIR):
        os.makedirs(settings.MEDIA_DIR)

    response_data = []

    for file in files:
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            # Skip invalid files or handle error
            continue

        file_path = os.path.join(settings.MEDIA_DIR, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        db_document = Document(
            filename=file.filename,
            storage_path=file_path,
            status=DocumentStatus.PENDING
        )
        db.add(db_document)
        await db.commit()
        await db.refresh(db_document)

        process_document_task.delay(str(db_document.id))
        
        response_data.append(DocumentIngestData(
            document_id=db_document.id,
            filename=db_document.filename,
            status=db_document.status
        ))

    if not response_data:
        raise HTTPException(status_code=400, detail="No valid files provided (only PDF and DOCX are allowed).")

    return IngestResponse(
        message="Files uploaded successfully and are being processed.",
        data=response_data
    )

@router.get("/ingest/status/{document_id}", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Document).where(Document.id == document_id)
    result = await db.execute(stmt)
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return DocumentStatusResponse(
        document_id=document.id,
        status=document.status,
        ready_for_extraction=(document.status == DocumentStatus.COMPLETED)
    )

from app.schemas.document import ExtractionRequest, ExtractionResponse, AuditRequest, AuditResponse
from app.services.contract_service import extract_contract_data, audit_contract

@router.post("/extract", response_model=ExtractionResponse)
async def extract_document_metadata(
    request: ExtractionRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        extracted_data = await extract_contract_data(db, request.document_id)
        return ExtractionResponse(
            document_id=request.document_id,
            extracted_data=extracted_data
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/audit", response_model=AuditResponse)
async def audit_document(
    request: AuditRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        audit_report = await audit_contract(db, request.document_id)
        return AuditResponse(
            document_id=request.document_id,
            audit_report=audit_report
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


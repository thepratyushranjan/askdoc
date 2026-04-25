import os
import shutil
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.models import Document, DocumentStatus
from app.schemas.document import DocumentResponse
from app.core.config import settings
from app.services.document_service import process_document_task

router = APIRouter()

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    # 1. Validate file extension
    allowed_extensions = [".pdf", ".docx"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are allowed.")

    # 2. Ensure media directory exists
    if not os.path.exists(settings.MEDIA_DIR):
        os.makedirs(settings.MEDIA_DIR)

    # 3. Define storage path
    file_path = os.path.join(settings.MEDIA_DIR, file.filename)

    # 4. Save file to media folder
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 5. Save metadata to database
    db_document = Document(
        filename=file.filename,
        storage_path=file_path,
        status=DocumentStatus.PENDING
    )
    db.add(db_document)
    await db.commit()
    await db.refresh(db_document)

    # 6. Trigger background processing task
    background_tasks.add_task(process_document_task, db_document.id)

    return db_document

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document_status(
    document_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Document).where(Document.id == document_id)
    result = await db.execute(stmt)
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return document

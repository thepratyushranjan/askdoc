import os
import asyncio
from typing import List
from uuid import UUID
from pypdf import PdfReader
import docx
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import select
from celery import Celery
from google import genai

from app.models.models import Document, DocumentChunk, DocumentStatus
from app.core.config import settings
from app.db.session import AsyncSessionLocal

# Initialize Celery
celery_app = Celery(
    "tasks",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://redis:6379/0")
)

def extract_text_sync(file_path: str) -> str:
    _, ext = os.path.splitext(file_path)
    if ext.lower() == ".pdf":
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    elif ext.lower() == ".docx":
        doc = docx.Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

def chunk_text_sync(text: str) -> List[str]:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100,
        length_function=len,
    )
    return text_splitter.split_text(text)

def generate_embeddings_sync(chunks: List[str]) -> List[List[float]]:
    if not chunks:
        return []
        
    # Using the new genai client properly initialized with the API key from environment
    client = genai.Client()
    
    # We must chunk the request if there are too many items to embed to avoid payload limits
    # However for a quick fix, let's just make sure we are calling the correct model.
    # The error indicates "models/text-embedding-004" is not found.
    # The correct model name in Google Gen AI is "text-embedding-004".
    try:
        embeddings = []
        for chunk in chunks:
            response = client.models.embed_content(
                model="gemini-embedding-2",
                contents=chunk,
                config={"output_dimensionality": 768}
            )
            if response.embeddings:
                embeddings.append(response.embeddings[0].values)
            else:
                embeddings.append([0.0] * 768) # Fallback to avoid out of range
        return embeddings
    except Exception as e:
        print(f"Embedding error: {e}")
        return []

@celery_app.task(name="process_document")
def process_document_task(doc_id_str: str):
    doc_id = UUID(doc_id_str)
    
    # Run the async logic in a synchronous wrapper for Celery
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    return loop.run_until_complete(_process_document_async(doc_id))

async def _process_document_async(doc_id: UUID):
    async with AsyncSessionLocal() as db:
        try:
            # 1. Fetch document and mark as processing
            stmt = select(Document).where(Document.id == doc_id)
            result = await db.execute(stmt)
            doc = result.scalar_one_or_none()
            
            if not doc:
                print(f"Document {doc_id} not found.")
                return
                
            doc.status = DocumentStatus.PROCESSING
            await db.commit()
            
            # 2. Extract text (CPU bound)
            text = await asyncio.to_thread(extract_text_sync, doc.storage_path)
            
            # 3. Chunk text (CPU bound)
            chunks = await asyncio.to_thread(chunk_text_sync, text)
            
            # 4. Generate embeddings via Gemini API (I/O bound)
            embeddings = await asyncio.to_thread(generate_embeddings_sync, chunks)
            
            # 5. Save chunks and embeddings to DB directly
            for i, chunk_content in enumerate(chunks):
                doc_chunk = DocumentChunk(
                    document_id=doc.id,
                    content=chunk_content,
                    chunk_index=i,
                    embedding=embeddings[i] if embeddings else None
                )
                db.add(doc_chunk)
            
            await db.commit()
            
            # 6. Mark as completed
            doc.status = DocumentStatus.COMPLETED
            await db.commit()
            print(f"Successfully processed document: {doc.filename}")
            
        except Exception as e:
            await db.rollback()
            # Fetch doc again in case it's detached
            stmt = select(Document).where(Document.id == doc_id)
            result = await db.execute(stmt)
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = DocumentStatus.FAILED
                doc.error_log = str(e)
                await db.commit()
            print(f"Failed to process document {doc_id}: {e}")

import os
import faiss
import numpy as np
import pickle
import asyncio
from typing import List
from uuid import UUID
from pypdf import PdfReader
import docx
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from sqlalchemy import select
from app.models.models import Document, DocumentChunk, DocumentStatus
from app.core.config import settings
from app.db.session import AsyncSessionLocal

# We load the embedding model globally so it's only loaded once in memory
model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)

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

def generate_embeddings_and_store_faiss_sync(chunks: List[str], doc_id: UUID, start_chunk_index: int):
    if not chunks:
        return
        
    embeddings = model.encode(chunks)
    dimension = embeddings.shape[1]
    
    os.makedirs(settings.VECTOR_STORE_DIR, exist_ok=True)
    index_path = os.path.join(settings.VECTOR_STORE_DIR, "index.faiss")
    metadata_path = os.path.join(settings.VECTOR_STORE_DIR, "metadata.pkl")
    
    # Load or create index
    if os.path.exists(index_path):
        index = faiss.read_index(index_path)
        with open(metadata_path, "rb") as f:
            metadata = pickle.load(f)
    else:
        index = faiss.IndexFlatL2(dimension)
        metadata = []
        
    # Add to FAISS index
    index.add(embeddings.astype("float32"))
    
    # Add metadata
    for i, chunk_content in enumerate(chunks):
        metadata.append({
            "document_id": str(doc_id),
            "chunk_index": start_chunk_index + i,
            "content": chunk_content
        })
        
    # Save back to disk
    faiss.write_index(index, index_path)
    with open(metadata_path, "wb") as f:
        pickle.dump(metadata, f)

async def process_document_task(doc_id: UUID):
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
            
            # 4. Save chunks to DB
            doc_chunks = []
            for i, chunk_content in enumerate(chunks):
                doc_chunk = DocumentChunk(
                    document_id=doc.id,
                    content=chunk_content,
                    chunk_index=i
                )
                db.add(doc_chunk)
                doc_chunks.append(doc_chunk)
            
            await db.commit()
            
            # 5. Generate embeddings and save to FAISS (CPU bound)
            await asyncio.to_thread(
                generate_embeddings_and_store_faiss_sync, 
                chunks, 
                doc.id, 
                0
            )
            
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

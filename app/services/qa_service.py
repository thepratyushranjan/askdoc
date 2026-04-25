import os
import faiss
import pickle
from typing import List
from uuid import UUID
from openai import AsyncOpenAI
from sentence_transformers import SentenceTransformer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import Conversation, Message, MessageRole, Document, DocumentStatus
from app.core.config import settings
from app.services.prompts import RAG_SYSTEM_PROMPT

# Load the embedding model globally
model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)

# Initialize OpenAI client pointed to Gemini
client = AsyncOpenAI(
    api_key=settings.GEMINI_API_KEY,
    base_url=settings.GEMINI_BASE_URL,
)

def search_faiss_sync(query: str, document_id: UUID, top_k: int = 5) -> List[str]:
    """Searches FAISS for the most relevant chunks for a specific document."""
    index_path = os.path.join(settings.VECTOR_STORE_DIR, "index.faiss")
    metadata_path = os.path.join(settings.VECTOR_STORE_DIR, "metadata.pkl")
    
    if not os.path.exists(index_path) or not os.path.exists(metadata_path):
        return []
    
    index = faiss.read_index(index_path)
    with open(metadata_path, "rb") as f:
        metadata = pickle.load(f)
        
    query_embedding = model.encode([query])
    distances, indices = index.search(query_embedding.astype("float32"), top_k * 3) # fetch more, then filter by doc_id
    
    relevant_chunks = []
    # FAISS indices map 1-to-1 with the metadata list
    for idx in indices[0]:
        if idx != -1 and idx < len(metadata):
            meta = metadata[idx]
            if meta["document_id"] == str(document_id):
                relevant_chunks.append(meta["content"])
                if len(relevant_chunks) >= top_k:
                    break
                    
    return relevant_chunks

async def process_chat_message(
    db: AsyncSession, 
    conversation_id: UUID, 
    user_message: str
) -> str:
    # 1. Verify Conversation & Document
    stmt = select(Conversation).where(Conversation.id == conversation_id)
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()
    
    if not conversation:
        return "Conversation not found."
        
    stmt_doc = select(Document).where(Document.id == conversation.document_id)
    doc_result = await db.execute(stmt_doc)
    document = doc_result.scalar_one_or_none()
    
    if not document or document.status != DocumentStatus.COMPLETED:
        return "Document is not yet processed completely."

    # 2. Get Conversation History
    stmt_hist = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc())
    hist_result = await db.execute(stmt_hist)
    history = hist_result.scalars().all()
    
    # 3. Retrieve Context via FAISS (offloaded to thread)
    import asyncio
    context_chunks = await asyncio.to_thread(search_faiss_sync, user_message, conversation.document_id)
    context_text = "\n\n---\n\n".join(context_chunks)
    
    # 4. Construct Prompt
    system_prompt = RAG_SYSTEM_PROMPT.format(context=context_text)
    
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add history
    for msg in history:
        messages.append({"role": msg.role.value, "content": msg.content})
        
    # Add current message
    messages.append({"role": "user", "content": user_message})
    
    # 5. Save User Message
    db_user_msg = Message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=user_message
    )
    db.add(db_user_msg)
    await db.commit()

    # 6. Call Gemini API via OpenAI compatibility layer
    try:
        if not settings.GEMINI_API_KEY:
             return "Configuration Error: GEMINI_API_KEY is not set."
             
        response = await client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=messages,
            temperature=0.0,
        )
        ai_response = response.choices[0].message.content
    except Exception as e:
        print(f"Error calling LLM API: {e}")
        ai_response = "I encountered an error while trying to generate a response. Please try again later."
        
    # 7. Save Assistant Message
    db_ai_msg = Message(
        conversation_id=conversation_id,
        role=MessageRole.ASSISTANT,
        content=ai_response
    )
    db.add(db_ai_msg)
    await db.commit()
    
    return ai_response

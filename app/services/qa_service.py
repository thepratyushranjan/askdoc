import os
import re
import json
import asyncio
import faiss
import pickle
from typing import List, Tuple
from uuid import UUID
from openai import AsyncOpenAI
from sentence_transformers import SentenceTransformer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import Conversation, Message, MessageRole, Document, DocumentStatus
from app.core.config import settings
from app.services.prompts import (
    RAG_SYSTEM_PROMPT,
    CONDENSE_QUESTION_PROMPT,
    FOLLOW_UP_PROMPT,
)

# How many recent messages (user + assistant combined) to keep in the LLM context.
HISTORY_WINDOW = 10
# How many recent messages to feed into the condense step.
CONDENSE_HISTORY_WINDOW = 6

LLM_MODEL = "gemini-2.5-flash"

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
    distances, indices = index.search(query_embedding.astype("float32"), top_k * 3)

    relevant_chunks = []
    for idx in indices[0]:
        if idx != -1 and idx < len(metadata):
            meta = metadata[idx]
            if meta["document_id"] == str(document_id):
                relevant_chunks.append(meta["content"])
                if len(relevant_chunks) >= top_k:
                    break

    return relevant_chunks


async def condense_question(history: List[Message], question: str) -> str:
    """Rewrite a follow-up question into a standalone search query using recent history.

    Returns the original question if there is no useful history or the call fails.
    """
    if not history:
        return question

    recent = history[-CONDENSE_HISTORY_WINDOW:]
    history_text = "\n".join(f"{m.role.value}: {m.content}" for m in recent)
    prompt = CONDENSE_QUESTION_PROMPT.format(history=history_text, question=question)

    try:
        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
        condensed = (response.choices[0].message.content or "").strip()
        # Strip surrounding quotes if the model added them.
        condensed = condensed.strip('"\'`')
        if condensed and len(condensed) < 400:
            return condensed
    except Exception as e:
        print(f"condense_question failed, falling back to raw question: {e}")

    return question


async def generate_follow_ups(context: str, question: str, answer: str) -> List[str]:
    """Generate up to 5 short follow-up questions grounded in the document context."""
    if not context:
        return []

    prompt = FOLLOW_UP_PROMPT.format(context=context, question=question, answer=answer)

    try:
        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
        )
        text = (response.choices[0].message.content or "").strip()

        # Strip ```json ... ``` fences if present.
        fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text)
        if fence:
            text = fence.group(1)

        # Last-resort: pull the first JSON array out of the string.
        if not text.startswith("["):
            arr_match = re.search(r"\[[\s\S]*\]", text)
            if arr_match:
                text = arr_match.group(0)

        parsed = json.loads(text)
        if isinstance(parsed, list):
            cleaned = [str(q).strip() for q in parsed if str(q).strip()]
            return cleaned[:5]
    except Exception as e:
        print(f"generate_follow_ups failed: {e}")

    return []


async def process_chat_message(
    db: AsyncSession,
    conversation_id: UUID,
    user_message: str,
) -> Tuple[str, List[str]]:
    # 1. Verify Conversation & Document
    stmt = select(Conversation).where(Conversation.id == conversation_id)
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()

    if not conversation:
        return "Conversation not found.", []

    stmt_doc = select(Document).where(Document.id == conversation.document_id)
    doc_result = await db.execute(stmt_doc)
    document = doc_result.scalar_one_or_none()

    if not document or document.status != DocumentStatus.COMPLETED:
        return "Document is not yet processed completely.", []

    # 2. Get full conversation history (chronological).
    stmt_hist = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    hist_result = await db.execute(stmt_hist)
    history = list(hist_result.scalars().all())

    # 3. Condense follow-up questions into a standalone search query.
    search_query = await condense_question(history, user_message)

    # 4. Retrieve context via FAISS using the condensed query.
    context_chunks = await asyncio.to_thread(
        search_faiss_sync, search_query, conversation.document_id
    )
    context_text = "\n\n---\n\n".join(context_chunks)

    # 5. Build the LLM message array with a sliding window of recent history.
    system_prompt = RAG_SYSTEM_PROMPT.format(context=context_text)
    messages = [{"role": "system", "content": system_prompt}]

    windowed_history = history[-HISTORY_WINDOW:]
    for msg in windowed_history:
        messages.append({"role": msg.role.value, "content": msg.content})

    messages.append({"role": "user", "content": user_message})

    # 6. Persist the user's message.
    db_user_msg = Message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=user_message,
    )
    db.add(db_user_msg)
    await db.commit()

    # 7. Call the LLM for the answer.
    if not settings.GEMINI_API_KEY:
        return "Configuration Error: GEMINI_API_KEY is not set.", []

    try:
        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            temperature=0.0,
        )
        ai_response = response.choices[0].message.content or ""
    except Exception as e:
        print(f"Error calling LLM API: {e}")
        ai_response = (
            "I encountered an error while trying to generate a response. Please try again later."
        )
        # Persist the assistant error so history stays consistent, then return.
        db_ai_msg = Message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=ai_response,
        )
        db.add(db_ai_msg)
        await db.commit()
        return ai_response, []

    # 8. Persist the assistant message and generate follow-ups in parallel.
    db_ai_msg = Message(
        conversation_id=conversation_id,
        role=MessageRole.ASSISTANT,
        content=ai_response,
    )
    db.add(db_ai_msg)

    follow_ups_task = asyncio.create_task(
        generate_follow_ups(context_text, user_message, ai_response)
    )
    await db.commit()
    follow_ups = await follow_ups_task

    return ai_response, follow_ups

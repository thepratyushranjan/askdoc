# Smart Document Q&A System

A production-ready REST API that allows users to upload documents (PDFs/DOCX) and ask natural language questions based on the document's content.

## 🏗️ Architecture & Design Choices

This system follows an asynchronous, modular Retrieval-Augmented Generation (RAG) architecture.

### Why these technologies?
*   **FastAPI:** Chosen for its native asynchronous support, auto-generated documentation (Swagger), and incredible speed.
*   **PostgreSQL + SQLAlchemy:** Used for relational data (Document metadata, Conversation threads, Message history). We utilize UUIDs for primary keys to prevent enumeration attacks.
*   **Sentence Transformers (`all-MiniLM-L6-v2`):** This model was chosen because it is the gold standard for local, CPU-based vector embeddings. It provides excellent semantic accuracy without requiring a massive GPU.
*   **FAISS:** Facebook's AI Similarity Search is used as the local vector database. We chose to keep vectors in FAISS (and map them to PostgreSQL) to strictly adhere to the prompt's tech stack requirements, ensuring lightning-fast nearest-neighbor lookups.
*   **Background Tasks:** Document processing (text extraction, chunking, and embedding) is CPU-heavy. To prevent blocking the API, these tasks are offloaded to FastAPI `BackgroundTasks` running on a separate thread pool (`asyncio.to_thread`).
*   **Chunking Strategy:** We use `RecursiveCharacterTextSplitter` with a chunk size of 1000 and an overlap of 100. This ensures that context isn't lost if a sentence crosses a chunk boundary, preventing the LLM from receiving "garbage context."
*   **Anti-Hallucination:** The system uses a strict system prompt that forces the LLM to rely *only* on the retrieved context. If the answer isn't there, it is instructed to explicitly state it cannot find the answer, rather than guessing.

---

## 🚀 Getting Started

### 1. Prerequisites
*   Docker & Docker Compose installed.
*   A Gemini API Key (or OpenAI API Key).

### 2. Setup Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
Open `.env` and add your API key:
```env
GEMINI_API_KEY=your-actual-api-key-here
```

### 3. Start the Application
Run the following command to build the containers and start the database and API.
*(Note: The first build will take several minutes as it downloads PyTorch and machine learning dependencies).*

```bash
docker compose up -d --build
```
The API will be available at: `http://localhost:8069`

---

## 🧪 Testing the API via cURL

### Step 1: Upload a Document
Uploads a document and starts the background vectorization process.
```bash
curl -X POST "http://localhost:8069/api/v1/documents/upload" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@sample1.pdf"
```
**Response:** Note the `id` (Document ID).
```json
{
  "id": "20ace2fe-6356-48bc-a9f8-19fce392c42e",
  "filename": "sample1.pdf",
  "status": "pending",
  "created_at": "2026-04-25T12:00:00"
}
```

### Step 2: Check Processing Status
Before asking questions, ensure the document status is `completed`.
```bash
curl -X GET "http://localhost:8069/api/v1/documents/20ace2fe-6356-48bc-a9f8-19fce392c42e" \
  -H "accept: application/json"
```

### Step 3: Start a Conversation
Create a chat thread linked to your processed document.
```bash
curl -X POST "http://localhost:8069/api/v1/chat/conversations/20ace2fe-6356-48bc-a9f8-19fce392c42e" \
  -H "accept: application/json"
```
**Response:** Note the `id` (Conversation ID).

### Step 4: Ask a Question
Ask a question using the Conversation ID.
```bash
curl -X POST "http://localhost:8069/api/v1/chat/conversations/<CONVERSATION-ID>/ask" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the summary of this document?"}'
```

### Step 5: View Chat History
Fetch the entire thread to see follow-up context.
```bash
curl -X GET "http://localhost:8069/api/v1/chat/conversations/<CONVERSATION-ID>" \
  -H "accept: application/json"
```

---

## 🛡️ Failure Handling
*   **Corrupt Documents:** If PyPDF fails to extract text, the background task catches the exception, logs it, and updates the document status to `failed`.
*   **LLM Outages:** The LLM call is wrapped in a try/except block. If the API times out or is unreachable, the system gracefully returns: *"I encountered an error while trying to generate a response. Please try again later."*

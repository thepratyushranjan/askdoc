# Askdoc: Smart Document Q&A System

Askdoc is a high-performance, asynchronous Retrieval-Augmented Generation (RAG) system that allows users to upload documents (PDF/DOCX) and engage in natural language conversations based on the content. It leverages state-of-the-art open-source embeddings and Google's Gemini models to provide accurate, context-aware answers.

## 🌟 Features

- **Multi-format Support:** Seamlessly process PDF and DOCX files.
- **Distributed Task Queue:** Background document ingestion using **Celery and Redis** to ensure the API stays responsive even under high load.
- **Real-time Monitoring:** Integrated **Flower** dashboard to monitor background task status, execution times, and worker health.
- **Semantic Search:** Utilizes `SentenceTransformers` (`all-MiniLM-L6-v2`) and `FAISS` for lightning-fast, accurate context retrieval.
- **Intelligent Conversations:** 
    - **Question Condensation:** Rewrites follow-up questions into standalone queries for better retrieval.
    - **Follow-up Suggestions:** Automatically generates relevant follow-up questions based on the context.
    - **Anti-Hallucination:** Strict system prompting ensures answers are grounded only in the provided documents.
- **Modern UI:** Responsive React-based frontend with real-time processing updates and a clean chat interface.
- **Persistent Storage:** PostgreSQL for metadata and conversation history, with FAISS for efficient vector indexing.

## 🏗️ Architecture

The system is built with a modular, distributed architecture:

- **Backend:** FastAPI (Python 3.13+)
- **Frontend:** React (TypeScript) with Vite
- **Task Queue:** Celery with Redis (Broker)
- **Monitoring:** Flower (at `http://localhost:5555`)
- **Database:** PostgreSQL (Metadata, Conversations, Messages)
- **Vector Store:** FAISS (Local CPU-based)
- **Embeddings:** Sentence Transformers (`all-MiniLM-L6-v2`)
- **LLM:** Google Gemini 2.5 Flash

For a detailed breakdown and system design diagrams, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 🚀 Getting Started

### 1. Prerequisites
- Docker and Docker Compose
- Gemini API Key (get one at [Google AI Studio](https://aistudio.google.com/))

### 2. Environment Setup
Copy the example environment file and fill in your credentials:
```bash
cp .env.example .env
```
Key variables:
- `GEMINI_API_KEY`: Your Google AI API key.
- `POSTGRES_*`: Database configuration.

### 3. Run with Docker
Start the entire stack (API, Workers, Redis, DB) using Docker Compose:
```bash
docker compose up -d --build
```
- **API/Frontend:** `http://localhost:8069`
- **Flower (Monitoring):** `http://localhost:5555`

---

## 🧪 Testing the API via cURL

### Step 1: Upload a Document
Uploads a document and starts the distributed vectorization process.

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
Monitor the status via API or visit the Flower dashboard at `http://localhost:5555`.

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

## 🔒 Security & Reliability
- **Distributed Processing:** Tasks are offloaded to workers, protecting the API from heavy CPU load.
- **UUIDs:** All public-facing identifiers use UUIDs to prevent enumeration.
- **Error Handling:** Robust worker-level error catching with status updates in the DB.
- **Graceful Failures:** Friendly error messages for LLM timeouts or unsupported file formats.

---
Developed with ♥ by **Pratyush** • © 2026

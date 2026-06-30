# Askdoc: Contract Intelligence System

Askdoc is a production-grade Contract Intelligence Backend System. It enables asynchronous ingestion of PDF/DOCX contracts, structured metadata extraction, semantic RAG-based Q&A, and automated clause risk analysis. The system is designed for high concurrency with distributed background workers and comprehensive observability.

## 🌟 Features

- **Production-Grade Architecture:** Clean modular backend (`api/`, `services/`, `models/`, `core/`), fully Dockerized with `docker-compose`.
- **Async & Scalable Processing:** Background document ingestion using **Celery and Redis** to ensure the API stays responsive even under high load.
- **Observability + Reliability Mindset:** Features `/healthz` and `/metrics` endpoints tracking LLM token usage, latencies, and failures. Graceful degradation on database failures.
- **Structured Extraction:** Forces the LLM to output a strict, validated JSON schema containing contract metadata (parties, terms, liability caps).
- **RAG-based Q&A:** Grounded semantic search via `pgvector` with strict anti-hallucination prompting and document chunk citations.
- **Risk Audit Engine:** Automatically detects risky clauses (e.g., unlimited liability, broad indemnity).
- **Streaming Support:** Supports streaming LLM responses (`/ask/stream`) for the Q&A interface.
- **Real-time Monitoring:** Integrated **Flower** dashboard to monitor background task status, execution times, and worker health.

## 🏗️ Architecture

The system is built with a modular, distributed architecture:

- **Backend:** FastAPI (Python 3.13+)
- **Frontend:** React (TypeScript) with Vite
- **Task Queue:** Celery with Redis (Broker)
- **Monitoring:** Flower (at `http://localhost:5555`)
- **Database & Vector Store:** PostgreSQL + `pgvector` (Metadata, Conversations, Embeddings)
- **Embeddings:** `gemini-embedding-2` (768 dimensions)
- **LLM:** Google Gemini 2.5 Flash

For a detailed breakdown and system design diagrams, see [DESIGN.md](./DESIGN.md).

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

### 1. Ingestion (Async PDF/DOCX Processing)
Uploads a document and returns the `document_ids`.

```bash
curl -X POST "http://localhost:8069/api/v1/ingest" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "files=@contract.docx"
```

**Response:** Note the `document_id`.

```json
{
  "message": "Files uploaded successfully and are being processed.",
  "data": [
    {
      "document_id": "20ace2fe-6356-48bc-a9f8-19fce392c42e",
      "filename": "contract.docx",
      "status": "pending"
    }
  ]
}
```

### 2. Structured Extraction
Extracts structured JSON fields from the document.

```bash
curl -X POST "http://localhost:8069/api/v1/extract" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"document_id": "<DOCUMENT-ID>"}'
```

### 3. RAG-based Q&A
Ask a grounded question and get citations.

```bash
curl -X POST "http://localhost:8069/api/v1/chat/conversations/<conversations_id>/ask" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
        "message": "What is the liability cap?"
      }'
```

### 4. Risk Audit Engine
Detects risky clauses like unlimited liability or auto-renewal.

```bash
curl -X POST "http://localhost:8069/api/v1/audit" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"document_id": "<DOCUMENT-ID>"}'
```

### 5. Streaming Q&A
Streams the answer back chunk by chunk.

```bash
curl -X GET "http://localhost:8069/api/v1/ask/stream?query=Who%20are%20the%20parties%3F&document_ids=<DOCUMENT-ID>" \
  -H "accept: text/event-stream"
```

### 6. System Endpoints
Observe the health and performance metrics of the backend.

```bash
# Check if Postgres, pgvector, and Redis are up
curl -s http://localhost:8069/api/v1/healthz

# View requests, latency, failures, and LLM token usage
curl -s http://localhost:8069/api/v1/metrics
```

*(The OpenAPI documentation is automatically available at `http://localhost:8069/docs`)*

---

## 🔒 Security & Reliability
- **Distributed Processing:** Tasks are offloaded to workers, protecting the API from heavy CPU load.
- **UUIDs:** All public-facing identifiers use UUIDs to prevent enumeration.
- **Error Handling:** Robust worker-level error catching with status updates in the DB.
- **Graceful Failures:** Friendly error messages for LLM timeouts or unsupported file formats.

---

## ⚖️ Trade-offs

1. **pgvector vs Local Vector DBs (FAISS/Chroma):** We chose `pgvector` for simplicity of infrastructure and transactional consistency (metadata and embeddings live together), at the cost of slightly higher CPU usage on the database instance compared to a dedicated FAISS cluster.
2. **REST Polling vs WebSockets:** Currently, the frontend polls the `/documents/{id}` endpoint to check when Celery finishes processing. WebSockets would provide instant updates and lower network overhead, but REST polling was chosen for its simplicity and robustness in this initial iteration.
3. **Chunking Strategy:** `RecursiveCharacterTextSplitter` with 1000 characters and 100 overlap balances context size with retrieval precision. However, this naive approach can sometimes split highly tabular data sub-optimally. A future trade-off could involve using an LLM-based layout parser at the cost of significantly longer processing times.

---
Developed with ♥ by **Pratyush** • © 2026

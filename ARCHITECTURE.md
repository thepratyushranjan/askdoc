# Askdoc System Architecture & Design

This document describes the technical architecture and data flows of the Askdoc Retrieval-Augmented Generation (RAG) system. The system is designed for high concurrency, utilizing a distributed task queue for heavy AI processing.

## 🧱 Component Architecture

The system is composed of decoupled services, allowing the UI and API to remain lightning-fast and responsive while heavy AI tasks (text extraction, chunking, and embedding) are processed asynchronously by background workers.

```mermaid
graph TD
    Client[React Frontend] <-->|REST API| API[FastAPI Backend]
    
    subgraph Infrastructure
        API -->|Enqueue Task| Broker[(Redis)]
        Broker -->|Consume Task| Worker[Celery Worker]
        Flower[Celery Flower] -->|Monitor| Broker
    end
    
    subgraph Data Layer
        API <-->|asyncpg| PG[(PostgreSQL)]
        Worker <-->|asyncpg| PG
        API <-->|faiss-cpu| FAISS[(FAISS Vector Store)]
        Worker -->|Update| FAISS
        API -->|Local I/O| Disk[Local File System]
        Worker -->|Read| Disk
    end
    
    subgraph AI Pipeline
        Worker -->|SentenceTransformers| EMB[all-MiniLM-L6-v2]
        EMB --> FAISS
        API <-->|OpenAI SDK| LLM[Google Gemini 2.5 Flash]
    end
    
    classDef frontend fill:#61dafb,stroke:#333,stroke-width:2px,color:#000;
    classDef backend fill:#059669,stroke:#333,stroke-width:2px,color:#fff;
    classDef infra fill:#ef4444,stroke:#333,stroke-width:2px,color:#fff;
    classDef db fill:#3b82f6,stroke:#333,stroke-width:2px,color:#fff;
    classDef ai fill:#f59e0b,stroke:#333,stroke-width:2px,color:#000;
    
    class Client frontend;
    class API backend;
    class Broker,Worker,Flower infra;
    class PG,FAISS,Disk db;
    class EMB,LLM ai;
```

### 1. Frontend (React + TypeScript)
- **Framework:** Vite-powered React application.
- **State Management:** React Hooks (useState, useEffect, useCallback) for local and session state.
- **Communication:** `fetch` based API client.
- **Key Features:** Real-time document status polling, markdown rendering, and session persistence via `localStorage`.

### 2. Backend (FastAPI)
- **API Framework:** FastAPI for high-performance asynchronous request handling.
- **ORM:** SQLAlchemy with `asyncpg` for asynchronous database operations.
- **Migration:** Alembic for database schema versioning.

### 3. Distributed Task Queue (Celery + Redis)
- **Broker (Redis):** Acts as the message broker, securely holding tasks dispatched by FastAPI until a worker is ready.
- **Worker (Celery):** Runs in a separate isolated container. It consumes tasks from Redis and executes CPU-bound operations without blocking the API event loop.
- **Monitor (Flower):** Provides a web-based dashboard for real-time monitoring of Celery clusters, tracking task success rates, execution times, and worker health.

### 4. Data Storage
- **Relational DB (PostgreSQL):** Stores document metadata, chunk text, conversation threads, and message history (strict chronological ordering).
- **Vector Store (FAISS):** Stores high-dimensional vector embeddings of document chunks for efficient similarity search.

### 5. AI & ML Pipeline
- **Embedding Model:** `SentenceTransformers/all-MiniLM-L6-v2` - Baked directly into the Docker image for instant startup.
- **LLM:** `Google Gemini 2.5 Flash` - Used for natural language understanding, question condensation, and final response generation.
- **Text Splitter:** `RecursiveCharacterTextSplitter` from LangChain, configured with 1000-character chunks and 100-character overlap.

---

## 🔄 System Workflows

### 1. Document Ingestion Flow (Distributed)

When a user uploads a document, the API immediately returns a response while vectorization happens in an isolated Celery worker container.

```mermaid
sequenceDiagram
    participant U as User/Frontend
    participant A as FastAPI Server
    participant DB as PostgreSQL
    participant R as Redis Broker
    participant W as Celery Worker
    participant V as FAISS Index

    U->>A: POST /documents/upload (PDF/DOCX)
    A->>DB: Save Document Status (PENDING)
    A->>R: Dispatch process_document_task
    A-->>U: Return 200 OK (Document ID)
    
    %% Background processing
    R->>W: Consume Task
    activate W
    W->>DB: Update Status (PROCESSING)
    W->>W: Extract Text (PyPDF/python-docx)
    W->>W: Chunk Text (RecursiveCharacterTextSplitter)
    W->>DB: Save Text Chunks
    W->>W: Generate Embeddings (SentenceTransformers)
    W->>V: Store Embeddings
    W->>DB: Update Status (COMPLETED)
    deactivate W
    
    U->>A: GET /documents/{id} (Polling)
    A->>DB: Fetch Status
    A-->>U: Return Status (COMPLETED)
```

### 2. Q&A / Retrieval Flow

```mermaid
sequenceDiagram
    participant U as Frontend
    participant A as FastAPI Server
    participant DB as PostgreSQL
    participant LLM as Gemini 2.5 Flash
    participant V as FAISS Index

    U->>A: POST /chat/conversations/{id}/ask (Message)
    A->>DB: Fetch Conversation History
    
    %% Step 1: Condensation
    A->>LLM: Condense Query (History + New Question)
    LLM-->>A: Standalone Search Query
    
    %% Step 2: Retrieval
    A->>V: Search Index (query_embedding)
    V-->>A: Top-K Document Chunks
    
    %% Step 3: Generation & Persistence
    A->>DB: Save User Message
    A->>LLM: Generate Answer (System Prompt + Context)
    LLM-->>A: Final Answer
    A->>DB: Save Assistant Message
    
    %% Step 4: Parallel Follow-ups
    par Generate Follow-ups
        A->>LLM: Generate Follow-ups (Context + Answer)
        LLM-->>A: 5 JSON Follow-up Questions
    and Return Response
        A-->>U: Return ChatResponse (Answer + Follow-ups)
    end
```

---

## 🗄️ Database Schema (ERD)

```mermaid
erDiagram
    Document ||--o{ DocumentChunk : "has"
    Document ||--o{ Conversation : "has"
    Conversation ||--o{ Message : "contains"
    
    Document {
        UUID id PK
        string filename
        string storage_path
        enum status "PENDING, PROCESSING, COMPLETED, FAILED"
        text error_log
        datetime created_at
    }
    
    DocumentChunk {
        UUID id PK
        UUID document_id FK
        text content
        int chunk_index
    }
    
    Conversation {
        UUID id PK
        UUID document_id FK
        datetime created_at
    }
    
    Message {
        UUID id PK
        UUID conversation_id FK
        enum role "USER, ASSISTANT"
        text content
        datetime created_at
    }
```

## 🛠️ Technology Stack Decisions

- **Why Celery & Redis?** Offloading ML tasks (chunking and embeddings) ensures the API remains completely non-blocking. If 100 users upload PDFs simultaneously, the API stays responsive while Redis queues the jobs for the Celery workers to handle systematically. This is the gold standard for production-grade asynchronous processing.
- **Why FAISS over pgvector?** While the project includes `pgvector` dependencies, the current implementation uses FAISS to ensure maximum performance for local similarity searches and to adhere to a CPU-optimized local vector store pattern.
- **Why Gemini 2.5 Flash?** It provides exceptional speed and accuracy for RAG tasks, especially for the "condensation" and "follow-up" steps where low latency is critical to the user experience.

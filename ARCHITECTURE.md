# Askdoc System Architecture & Design

This document describes the technical architecture and data flows of the Askdoc Retrieval-Augmented Generation (RAG) system.

## 🧱 Component Architecture

The system is composed of decoupled services, allowing the UI to remain responsive while heavy AI tasks process asynchronously in the background.

```mermaid
graph TD
    Client[React Frontend] <-->|REST API| API[FastAPI Backend]
    
    subgraph Data Layer
        API <-->|SQLAlchemy/asyncpg| PG[(PostgreSQL)]
        API <-->|faiss-cpu| FAISS[(FAISS Vector Store)]
        API -->|Local I/O| Disk[Local File System]
    end
    
    subgraph AI Pipeline
        API -->|SentenceTransformers| EMB[all-MiniLM-L6-v2]
        EMB --> FAISS
        API <-->|OpenAI SDK| LLM[Google Gemini 2.0 Flash]
    end
    
    classDef frontend fill:#61dafb,stroke:#333,stroke-width:2px,color:#000;
    classDef backend fill:#059669,stroke:#333,stroke-width:2px,color:#fff;
    classDef db fill:#3b82f6,stroke:#333,stroke-width:2px,color:#fff;
    classDef ai fill:#f59e0b,stroke:#333,stroke-width:2px,color:#000;
    
    class Client frontend;
    class API backend;
    class PG,FAISS,Disk db;
    class EMB,LLM ai;
```

### 1. Frontend (React + TypeScript)
- **Framework:** Vite-powered React application.
- **State Management:** React Hooks (useState, useEffect, useCallback) for local and session state.
- **Communication:** `fetch` based API client for interacting with the FastAPI backend.
- **Key Features:** Real-time document status polling, markdown rendering for chat, and session persistence via `localStorage`.

### 2. Backend (FastAPI)
- **API Framework:** FastAPI for high-performance asynchronous request handling.
- **Task Management:** Utilizes FastAPI's `BackgroundTasks` for offloading CPU-intensive document processing.
- **ORM:** SQLAlchemy with `asyncpg` for asynchronous database operations.
- **Migration:** Alembic for database schema versioning.

### 3. Data Storage
- **Relational DB (PostgreSQL):** Stores document metadata, chunk text, conversation threads, and message history (strict chronological ordering).
- **Vector Store (FAISS):** Stores high-dimensional vector embeddings of document chunks for efficient similarity search.
- **File System:** Local storage for uploaded PDF and DOCX files.

### 4. AI & ML Pipeline
- **Embedding Model:** `SentenceTransformers/all-MiniLM-L6-v2` - chosen for its balance between performance and low resource consumption on CPUs.
- **LLM:** `Google Gemini 2.0 Flash` - used for natural language understanding, question condensation, and final response generation.
- **Text Splitter:** `RecursiveCharacterTextSplitter` from LangChain, configured with 1000-character chunks and 100-character overlap.

---

## 🔄 System Workflows

### 1. Document Ingestion Flow

When a user uploads a document, the API immediately returns a response while vectorization happens in a background thread to keep the server non-blocking.

```mermaid
sequenceDiagram
    participant U as User/Frontend
    participant A as FastAPI Server
    participant DB as PostgreSQL
    participant T as Background Task
    participant V as FAISS Index

    U->>A: POST /documents/upload (PDF/DOCX)
    A->>DB: Save Document Status (PENDING)
    A->>T: Dispatch process_document_task
    A-->>U: Return 200 OK (Document ID)
    
    %% Background processing
    activate T
    T->>DB: Update Status (PROCESSING)
    T->>T: Extract Text (PyPDF/python-docx)
    T->>T: Chunk Text (RecursiveCharacterTextSplitter)
    T->>DB: Save Text Chunks
    T->>T: Generate Embeddings (SentenceTransformers)
    T->>V: Store Embeddings
    T->>DB: Update Status (COMPLETED)
    deactivate T
    
    U->>A: GET /documents/{id} (Polling)
    A->>DB: Fetch Status
    A-->>U: Return Status (COMPLETED)
```

### 2. Q&A / Retrieval Flow

The chat flow implements an advanced RAG pattern that involves query condensation and parallel execution for optimal speed.

```mermaid
sequenceDiagram
    participant U as Frontend
    participant A as FastAPI Server
    participant DB as PostgreSQL
    participant LLM as Gemini 2.0 Flash
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

## 🗄️ Database Schema (ERD)

The relational data is stored in PostgreSQL. Below is the Entity-Relationship Diagram representing the core data models.

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

## 📁 Project Structure

```text
Askdoc/
├── app/                      # FastAPI Backend Application
│   ├── api/v1/endpoints/     # REST API route handlers (chat, documents)
│   ├── core/                 # App configuration and environment variables
│   ├── db/                   # Database session and base models
│   ├── models/               # SQLAlchemy ORM models
│   ├── schemas/              # Pydantic validation schemas
│   └── services/             # Core business logic (RAG, FAISS, LLM integration)
├── frontend/                 # React + Vite Frontend Application
│   ├── public/               # Static assets
│   └── src/                  # React components, hooks, and API client
├── media/                    # Local storage for uploaded PDF/DOCX files
├── migrations/               # Alembic database migration scripts
├── vector_store/             # FAISS local index and metadata files
├── docker-compose.yml        # Multi-container orchestration
├── Dockerfile                # Backend container definition
└── main.py                   # FastAPI application entry point
```

## 🛠️ Technology Stack Decisions

- **Why FAISS over pgvector?** While the project includes `pgvector` dependencies, the current implementation uses FAISS to ensure maximum performance for local similarity searches and to adhere to a CPU-optimized local vector store pattern.
- **Why BackgroundTasks?** Using FastAPI's native background tasks allows the system to remain responsive without the overhead of a full Celery/Redis setup for simpler deployments.
- **Why Gemini 2.0 Flash?** It provides exceptional speed and accuracy for RAG tasks, especially for the "condensation" and "follow-up" steps where low latency is critical to the user experience.

# Askdoc System Architecture

This document describes the technical architecture and data flow of the Askdoc RAG system.

## 🧱 Component Overview

### 1. Frontend (React + TypeScript)
- **Framework:** Vite-powered React application.
- **State Management:** React Hooks (useState, useEffect, useCallback) for local and session state.
- **Communication:** Axios-based API client for interacting with the FastAPI backend.
- **Key Features:** Real-time document status polling, markdown rendering for chat, and session persistence via `localStorage`.

### 2. Backend (FastAPI)
- **API Framework:** FastAPI for high-performance asynchronous request handling.
- **Task Management:** Utilizes FastAPI's `BackgroundTasks` for offloading CPU-intensive document processing.
- **ORM:** SQLAlchemy with `asyncpg` for asynchronous database operations.
- **Migration:** Alembic for database schema versioning.

### 3. Data Storage
- **Relational DB (PostgreSQL):** Stores document metadata, chunk text, conversation threads, and message history.
- **Vector Store (FAISS):** Stores high-dimensional vector embeddings of document chunks for efficient similarity search.
- **File System:** Local storage for uploaded PDF and DOCX files.

### 4. AI & ML Pipeline
- **Embedding Model:** `SentenceTransformers/all-MiniLM-L6-v2` - chosen for its balance between performance and low resource consumption on CPUs.
- **LLM:** `Google Gemini 2.0 Flash` - used for natural language understanding, question condensation, and final response generation.
- **Text Splitter:** `RecursiveCharacterTextSplitter` from LangChain, configured with 1000-character chunks and 100-character overlap.

## 🔄 Data Flows

### Document Ingestion Flow
1. **Upload:** User uploads a file via the frontend.
2. **Persistence:** Backend saves the file to the `media/` folder and creates a `PENDING` record in PostgreSQL.
3. **Background Processing:**
    - **Extraction:** Text is extracted using `pypdf` or `python-docx`.
    - **Chunking:** Text is split into overlapping segments.
    - **Vectorization:** Each chunk is converted into an embedding vector.
    - **Indexing:** Vectors are added to the local FAISS index.
    - **Completion:** Document status is updated to `COMPLETED` in the database.

### Q&A / Retrieval Flow
1. **Input:** User sends a message within a conversation.
2. **Condensation:** The system sends the recent chat history and the new question to Gemini to generate a standalone "search query."
3. **Retrieval:**
    - The search query is embedded using the same SentenceTransformer model.
    - A similarity search is performed against the FAISS index.
    - Relevant text chunks are retrieved and filtered by `document_id`.
4. **Augmentation:** The retrieved chunks are injected into a strict system prompt.
5. **Generation:** Gemini generates a response based *only* on the provided context.
6. **Post-processing:** A separate call to Gemini generates 5 relevant follow-up questions.
7. **Response:** The answer and follow-ups are returned to the user.

## 🛠️ Technology Stack Decisions

- **Why FAISS over pgvector?** While the project includes `pgvector` dependencies, the current implementation uses FAISS to ensure maximum performance for local similarity searches and to adhere to a CPU-optimized local vector store pattern.
- **Why BackgroundTasks?** Using FastAPI's native background tasks allows the system to remain responsive without the overhead of a full Celery/Redis setup for simpler deployments.
- **Why Gemini 2.0 Flash?** It provides exceptional speed and accuracy for RAG tasks, especially for the "condensation" and "follow-up" steps where low latency is critical.

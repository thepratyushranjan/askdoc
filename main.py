from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import time
from sqlalchemy import text
from alembic.config import Config
from alembic import command
import os
from app.db.session import engine
from app.core.config import settings

def run_migrations():
    print("Running database migrations...")
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    print("Database migrations applied successfully.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting up {settings.PROJECT_NAME}...")
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            print("Database connection successful.")
            print("Ensuring pgvector extension exists...")
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        
        # Run Alembic migrations synchronously
        # We use asyncio.to_thread because Alembic operations are mostly blocking I/O
        import asyncio
        await asyncio.to_thread(run_migrations)

    except Exception as e:
        print(f"CRITICAL: Failed to connect to the database or run migrations: {e}")
        # Raise the exception to prevent the application from starting
        raise
    
    yield  # Application runs while yielded
    
    # --- SHUTDOWN LOGIC HERE ---
    print(f"Shutting down {settings.PROJECT_NAME}...")
    await engine.dispose()
    print("Database connections closed.")

app = FastAPI(title="Askdoc API", lifespan=lifespan)

# Setup Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

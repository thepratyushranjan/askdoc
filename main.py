from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import time
from sqlalchemy import text
from app.db.session import engine
from app.core.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP LOGIC HERE ---
    print(f"Starting up {settings.PROJECT_NAME}...")
    
    # Initialize database connections and ensure vector extension exists
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            print("Database connection successful.")
            print("Ensuring pgvector extension exists...")
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception as e:
        print(f"Failed to connect to the database or create pgvector extension: {e}")
        # Depending on your deployment, you might want to raise the exception here to prevent the app from starting without a DB
    
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

@app.get("/")
async def root():
    return {"message": "Hello from askdoc!"}

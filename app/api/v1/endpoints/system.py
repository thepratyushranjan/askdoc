import time
import os
from fastapi import APIRouter, Response, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.session import get_db
import redis.asyncio as redis

router = APIRouter()

# Simple in-memory metrics
METRICS = {
    "total_requests": 0,
    "total_failures": 0,
    "total_latency_seconds": 0.0,
    "llm_token_usage": 0,
    "start_time": time.time()
}

@router.get("/healthz")
async def healthz(response: Response, db: AsyncSession = Depends(get_db)):
    health_status = {
        "status": "ok",
        "services": {
            "postgres": "down",
            "pgvector": "down",
            "redis": "down"
        },
        "uptime_seconds": time.time() - METRICS["start_time"]
    }
    
    # Check Postgres & Vector
    try:
        res = await db.execute(text("SELECT 1"))
        if res.scalar() == 1:
            health_status["services"]["postgres"] = "up"
            
        res_vector = await db.execute(text("SELECT extname FROM pg_extension WHERE extname = 'vector'"))
        if res_vector.scalar():
            health_status["services"]["pgvector"] = "up"
    except Exception:
        pass
        
    # Check Redis
    try:
        r_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(r_url)
        if await r.ping():
            health_status["services"]["redis"] = "up"
        await r.aclose()
    except Exception:
        pass
        
    if "down" in health_status["services"].values():
        health_status["status"] = "error"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        
    return health_status

@router.get("/metrics")
async def metrics():
    avg_latency = 0.0
    if METRICS["total_requests"] > 0:
        avg_latency = METRICS["total_latency_seconds"] / METRICS["total_requests"]
        
    return {
        "http_requests_total": METRICS["total_requests"],
        "http_request_duration_seconds": avg_latency,
        "failures": METRICS["total_failures"],
        "llm_token_usage": METRICS["llm_token_usage"],
        "uptime_seconds": time.time() - METRICS["start_time"]
    }


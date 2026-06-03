"""ResuMate AI -- Multi-Agent Hiring Platform v3"""
import sys
import os
# Fix Windows console encoding for emoji prints
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import init_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("resumate")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("\n🚀 Starting ResuMate AI...")

    try:
        await init_db()
    except Exception as e:
        print(f"⚠️ Database init failed (using in-memory): {e}")
    
    from app.agents.orchestrator import orchestrator
    from app.agents.data_agent import data_agent
    from app.agents.hr_agent import hr_agent
    from app.agents.technical_agent import technical_agent
    from app.agents.research_agent import research_agent
    
    orchestrator.register("data", data_agent)
    orchestrator.register("hr", hr_agent)
    orchestrator.register("technical", technical_agent)
    orchestrator.register("research", research_agent)

    # Warm the in-memory candidate store from DB on startup
    try:
        from app.core.database import async_session as AsyncSessionLocal
        from app.models.candidate import Candidate
        from sqlalchemy import select
        from app.services.resume_rag import resume_rag
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Candidate).order_by(Candidate.id))
            rows = result.scalars().all()
            for row in rows:
                resume_rag.candidates[row.id] = {
                    "id": row.id,
                    "name": row.name or "",
                    "email": row.email or "",
                    "file_name": row.file_name or "",
                    "file_hash": row.file_hash or "",
                    "predicted_role": row.predicted_role or "",
                    "experience_level": row.experience_level or "",
                    "total_experience_years": row.total_experience_years or 0,
                    "location": row.location or "",
                    "summary": row.summary or "",
                    "skills": row.skills or [],
                    "work_experience": row.work_experience or [],
                    "education": row.education or [],
                    "key_strengths": row.key_strengths or [],
                    "badges": row.badges or [],
                    "embedded_links": row.embedded_links or {},
                    "text": row.full_text or row.raw_text or "",
                    "raw_text": row.raw_text or "",
                    "is_resume": row.is_resume,
                }
                if row.file_hash:
                    resume_rag.uploaded_file_hashes.add(row.file_hash)
            print(f"✅ Loaded {len(rows)} candidates from DB into memory")
    except Exception as e:
        print(f"⚠️ Could not warm candidate cache: {e}")

    print("✅ All agents registered")
    print(f"✅ ResuMate AI ready!\n")

    
    yield
    
    print("👋 Shutting down...")
    
    


# ═══ Rate limiter ═══
limiter = Limiter(key_func=get_remote_address)

# ═══ ONE app instance — everything registers here ═══
app = FastAPI(
    title="ResuMate AI",
    description="Multi-Agent AI Hiring Platform",
    version="3.0.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ═══ Uniform error response shape ═══
# All unhandled server errors are returned as {"error": {"type", "message"}}
# so the frontend doesn't have to special-case 3 different shapes.
from fastapi import Request as _Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as _StarletteHTTPException


@app.exception_handler(_StarletteHTTPException)
async def _http_exception_handler(_request: _Request, exc: _StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "type": "http_error",
                "message": exc.detail if isinstance(exc.detail, str) else "Request failed",
            },
            # Keep `detail` for backwards compatibility with existing frontend handlers.
            "detail": exc.detail,
        },
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(_request: _Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "type": "validation_error",
                "message": "Request validation failed",
                "fields": exc.errors(),
            },
            "detail": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(_request: _Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "type": exc.__class__.__name__,
                "message": "Internal server error",
            },
            "detail": "Internal server error",
        },
    )

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes — ALL registered on the SAME app
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.candidates import router as candidates_router
from app.api.livekit_routes import router as livekit_router
from app.api.advisor_agent import router as advisor_router
from app.api.pipeline import router as pipeline_router
from app.api.jarvis import router as jarvis_router
from app.api.realtime import router as realtime_router

app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(candidates_router, prefix="/api")
app.include_router(livekit_router)
app.include_router(advisor_router, prefix="/api")
app.include_router(pipeline_router, prefix="/api")
app.include_router(jarvis_router, prefix="/api")
app.include_router(realtime_router, prefix="/api")

print("[OK] All routers registered (auth, chat, candidates, livekit, advisor, pipeline, jarvis, realtime)")


@app.get("/")
async def root():
    return {
        "message": "ResuMate AI API",
        "version": "3.0.0",
        "architecture": "Multi-Agent (Data, HR, Technical, Research, Advisor)",
        "status": "running"
    }


@app.get("/health")
async def health():
    from app.agents.orchestrator import orchestrator
    return {
        "status": "healthy",
        "agents": list(orchestrator._agents.keys()),
        "llm": bool(settings.openai_api_key),
        "search": bool(settings.tavily_api_key),
        "github": bool(settings.github_token),
    }


@app.get("/monitoring")
async def monitoring():
    from app.agents.orchestrator import orchestrator
    from app.agents.base_agent import memory_store
    return {
        "orchestrator": orchestrator.get_monitoring_data(),
        "memory_agents": list(memory_store._store.keys()),
        "memory_entries": {k: len(v) for k, v in memory_store._store.items()},
    }
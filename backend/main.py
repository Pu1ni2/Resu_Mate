"""ResuMate AI — Multi-Agent Hiring Platform v3"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

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
    
    print("✅ All agents registered")
    print(f"✅ ResuMate AI ready!\n")


    try:
        from interview_agent import start_worker
        start_worker()
    except Exception as e:
        print(f"⚠️ Interview agent not started: {e}")
    
    yield
    
    print("👋 Shutting down...")
    
    


# ═══ ONE app instance — everything registers here ═══
app = FastAPI(
    title="ResuMate AI",
    description="Multi-Agent AI Hiring Platform",
    version="3.0.0",
    lifespan=lifespan
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
from app.api.chat import router as chat_router
from app.api.candidates import router as candidates_router
from app.api.livekit_routes import router as livekit_router
from app.api.advisor_agent import router as advisor_router

app.include_router(chat_router, prefix="/api")
app.include_router(candidates_router, prefix="/api")
app.include_router(livekit_router)
app.include_router(advisor_router, prefix="/api")

print("✅ All routers registered (chat, candidates, livekit, advisor)")


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
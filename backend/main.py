# """ResuMate AI - Main FastAPI Application"""
# from contextlib import asynccontextmanager
# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
# from app.core.config import settings
# from app.api import candidates, chat

# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     print("🚀 Starting ResuMate AI Backend...")
#     print(f"📍 API docs at http://localhost:{settings.port}/docs")
#     print(f"🤖 Using model: {settings.openai_model}")
#     if not settings.openai_api_key:
#         print("⚠️  WARNING: OPENAI_API_KEY not set!")
#     yield
#     print("👋 Shutting down...")

# app = FastAPI(
#     title="ResuMate AI",
#     description="AI-Powered Resume Analytics with LangChain + ChromaDB",
#     version="2.0.0",
#     lifespan=lifespan
# )

# # CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=settings.cors_origins_list,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Routes
# app.include_router(candidates.router, prefix="/api")
# app.include_router(chat.router, prefix="/api")

# @app.get("/")
# async def root():
#     return {
#         "name": "ResuMate AI",
#         "version": "2.0.0",
#         "model": settings.openai_model,
#         "status": "running"
#     }

# @app.get("/health")
# async def health():
#     return {
#         "status": "healthy",
#         "api_key_configured": bool(settings.openai_api_key)
#     }

"""Main FastAPI application"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import candidates, chat
from app.core.config import settings

# Create uploads directory
os.makedirs("uploads", exist_ok=True)

app = FastAPI(
    title="ResuMate AI API",
    description="AI-powered resume analysis platform",
    version="2.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(candidates.router, prefix="/api")
app.include_router(chat.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "message": "ResuMate AI API",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
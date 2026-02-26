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
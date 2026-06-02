"""
LiveKit Room Manager — Creates rooms and generates tokens for interview sessions.
Room configs are now persisted to the Interview DB record (room_name + room_config).
"""
import os
import time
import hashlib
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

load_dotenv(override=True)

import jwt  # PyJWT

from app.core.database import get_db
from app.models.candidate import Interview

router = APIRouter(prefix="/api/livekit", tags=["livekit"])

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

print(f"LiveKit URL: {'set' if LIVEKIT_URL else 'MISSING'}")
print(f"LiveKit API Key: {'set' if LIVEKIT_API_KEY else 'MISSING'}")
print(f"LiveKit API Secret: {'set' if LIVEKIT_API_SECRET else 'MISSING'}")

# In-memory fallback (for rooms created without a DB Interview record)
room_configs = {}


def create_livekit_token(room_name: str, participant_name: str, is_agent: bool = False) -> str:
    """Generate a LiveKit JWT token"""
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise ValueError("LiveKit credentials not configured")

    now = int(time.time())
    claims = {
        "iss": LIVEKIT_API_KEY,
        "sub": participant_name,
        "nbf": now,
        "exp": now + 3600,  # 1 hour
        "jti": hashlib.md5(f"{room_name}-{participant_name}-{now}".encode()).hexdigest(),
        "video": {
            "room": room_name,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        },
    }

    if is_agent:
        claims["video"]["agent"] = True

    token = jwt.encode(claims, LIVEKIT_API_SECRET, algorithm="HS256")
    return token


class CreateRoomRequest(BaseModel):
    candidate_email: str
    candidate_name: str
    interview_config: dict


class JoinRoomRequest(BaseModel):
    room_name: str
    participant_name: str


@router.post("/create-room")
async def create_room(req: CreateRoomRequest, db: AsyncSession = Depends(get_db)):
    """Create a LiveKit room for an interview session"""
    room_name = f"interview-{hashlib.md5(f'{req.candidate_email}-{time.time()}'.encode()).hexdigest()[:12]}"

    resume_intel = req.interview_config.get("resume_intelligence")
    verification_targets = []
    if resume_intel and isinstance(resume_intel, dict):
        verification_targets = resume_intel.get("verification_targets", [])

    config = {
        **req.interview_config,
        "candidate_name": req.candidate_name,
        "candidate_email": req.candidate_email,
        "verification_targets": verification_targets,
        "created_at": time.time(),
    }

    # Persist room_config to the Interview record if one exists for this candidate
    try:
        result = await db.execute(
            select(Interview)
            .where(Interview.candidate_email == req.candidate_email)
            .order_by(Interview.created_at.desc())
        )
        interview = result.scalars().first()
        if interview:
            interview.room_name = room_name
            interview.room_config = config
            await db.commit()
    except Exception as e:
        print(f"⚠️ Could not persist room_config to DB: {e}")

    # Also keep in-memory as fast fallback
    room_configs[room_name] = config

    token = create_livekit_token(room_name, req.candidate_name)
    print(f"🏠 LiveKit room created: {room_name} for {req.candidate_name} ({len(verification_targets)} verification targets)")

    return {
        "room_name": room_name,
        "token": token,
        "livekit_url": LIVEKIT_URL,
    }


@router.post("/join-room")
async def join_room(req: JoinRoomRequest):
    """Generate a token to join an existing room"""
    token = create_livekit_token(req.room_name, req.participant_name)
    return {
        "token": token,
        "livekit_url": LIVEKIT_URL,
    }


@router.get("/interview-room-config/{room_name}")
async def get_room_config(room_name: str, db: AsyncSession = Depends(get_db)):
    """Called by the Interview Agent to get the config for a room — DB-backed, survives restarts"""
    # Try in-memory cache first (fast path)
    if room_name in room_configs:
        return room_configs[room_name]

    # Fall back to DB
    try:
        result = await db.execute(
            select(Interview).where(Interview.room_name == room_name)
        )
        interview = result.scalars().first()
        if interview and interview.room_config:
            room_configs[room_name] = interview.room_config  # Warm the cache
            return interview.room_config
    except Exception as e:
        print(f"⚠️ Could not fetch room_config from DB: {e}")

    return {"error": "Room not found", "role": "General", "level": "Mid-Level", "num_questions": 5}


@router.get("/status")
async def livekit_status():
    """Check LiveKit configuration status"""
    return {
        "configured": bool(LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET),
        "url": LIVEKIT_URL[:30] + "..." if LIVEKIT_URL else "not set",
        "active_rooms": len(room_configs),
    }
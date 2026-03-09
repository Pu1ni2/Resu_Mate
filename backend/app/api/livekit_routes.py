"""
LiveKit Room Manager — Creates rooms and generates tokens for interview sessions.
"""
import os
import time
import json
import hashlib
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(override=True)

import jwt  # PyJWT

router = APIRouter(prefix="/api/livekit", tags=["livekit"])

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

print(f"🔑 LiveKit URL: {'✅ set' if LIVEKIT_URL else '❌ MISSING'}")
print(f"🔑 LiveKit API Key: {'✅ set' if LIVEKIT_API_KEY else '❌ MISSING'}")
print(f"🔑 LiveKit API Secret: {'✅ ' + LIVEKIT_API_SECRET[:8] + '...' if LIVEKIT_API_SECRET else '❌ MISSING'}")

# Store room configs so the agent can fetch them
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
async def create_room(req: CreateRoomRequest):
    """Create a LiveKit room for an interview session"""
    # Generate unique room name
    room_name = f"interview-{hashlib.md5(f'{req.candidate_email}-{time.time()}'.encode()).hexdigest()[:12]}"

    # Store config so the agent can fetch it
    room_configs[room_name] = {
        **req.interview_config,
        "candidate_name": req.candidate_name,
        "candidate_email": req.candidate_email,
        "created_at": time.time(),
    }

    # Generate token for candidate
    token = create_livekit_token(room_name, req.candidate_name)

    print(f"🏠 LiveKit room created: {room_name} for {req.candidate_name}")

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
async def get_room_config(room_name: str):
    """Called by the Interview Agent to get the config for a room"""
    config = room_configs.get(room_name, {})
    if not config:
        return {"error": "Room not found", "role": "General", "level": "Mid-Level", "num_questions": 5}
    return config


@router.get("/status")
async def livekit_status():
    """Check LiveKit configuration status"""
    return {
        "configured": bool(LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET),
        "url": LIVEKIT_URL[:30] + "..." if LIVEKIT_URL else "not set",
        "active_rooms": len(room_configs),
    }
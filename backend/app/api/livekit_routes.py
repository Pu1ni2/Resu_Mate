"""
LiveKit Room Manager — Creates rooms and generates tokens for interview sessions.
Room configs are now persisted to the Interview DB record (room_name + room_config).
"""
import os
import time
import hashlib
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

load_dotenv(override=True)

import jwt  # PyJWT

from app.core.database import get_db
from app.models.candidate import Interview
from app.services.auth import Actor, get_current_actor, verify_agent_token

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
    # candidate_email is accepted for the manager flow (a manager may open a room
    # on a candidate's behalf). For a candidate caller it is IGNORED and replaced
    # with the token's email — never trust a body field for identity.
    candidate_email: str = Field(default="", max_length=320)
    candidate_name: str = Field(default="", max_length=200)
    interview_config: dict = Field(default_factory=dict)


class JoinRoomRequest(BaseModel):
    room_name: str = Field(..., max_length=200)
    participant_name: str = Field(default="", max_length=200)


async def _authorized_interview(db: AsyncSession, actor: Actor, candidate_email: str) -> Interview:
    """Resolve the interview this actor may act on, or raise 403/404.

    Candidates may only touch interviews issued to their own token email.
    Managers may only touch interviews they own (manager_id). Legacy rows with a
    NULL manager_id are treated as unowned and therefore invisible to managers —
    the same safe default used elsewhere in the app.
    """
    email = (candidate_email or "").strip().lower()
    if actor.is_candidate:
        email = actor.email  # identity comes from the token, never the body

    if not email:
        raise HTTPException(status_code=400, detail="candidate_email is required")

    result = await db.execute(
        select(Interview)
        .where(Interview.candidate_email == email)
        .order_by(Interview.created_at.desc())
    )
    interview = result.scalars().first()
    if not interview:
        raise HTTPException(status_code=404, detail="No interview found for this candidate")

    if not actor.is_candidate and interview.manager_id != actor.manager_id:
        # 404 rather than 403 so we don't confirm the interview exists elsewhere.
        raise HTTPException(status_code=404, detail="No interview found for this candidate")

    return interview


@router.post("/create-room")
async def create_room(
    req: CreateRoomRequest,
    db: AsyncSession = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
):
    """Create a LiveKit room for an interview session.

    Requires auth: minting a LiveKit token costs real money and grants publish
    rights into a room. The caller must own the interview — a candidate by token
    email, a manager by manager_id.
    """
    interview = await _authorized_interview(db, actor, req.candidate_email)
    candidate_email = (interview.candidate_email or "").strip().lower()
    candidate_name = (
        req.candidate_name
        or (interview.candidate.name if interview.candidate else "")
        or candidate_email.split("@", 1)[0]
    )

    room_name = f"interview-{hashlib.md5(f'{candidate_email}-{time.time()}'.encode()).hexdigest()[:12]}"

    resume_intel = req.interview_config.get("resume_intelligence")
    verification_targets = []
    if resume_intel and isinstance(resume_intel, dict):
        verification_targets = resume_intel.get("verification_targets", [])

    config = {
        **req.interview_config,
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "verification_targets": verification_targets,
        "created_at": time.time(),
    }

    interview.room_name = room_name
    interview.room_config = config
    # An interview that has a live room is no longer "pending". Without this the
    # row stayed pending forever in avatar mode, so a dropped session was
    # indistinguishable from one never started.
    if interview.status == "pending":
        interview.status = "in_progress"
    await db.commit()

    # Also keep in-memory as fast fallback
    room_configs[room_name] = config

    token = create_livekit_token(room_name, candidate_name)
    print(f"🏠 LiveKit room created: {room_name} ({len(verification_targets)} verification targets)")

    return {
        "room_name": room_name,
        "token": token,
        "livekit_url": LIVEKIT_URL,
    }


@router.post("/join-room")
async def join_room(
    req: JoinRoomRequest,
    db: AsyncSession = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
):
    """Generate a token to join an existing room.

    Previously unauthenticated: anyone who learned or guessed a room name got a
    publish-capable token into a live interview. Now the room must belong to an
    interview this actor owns.
    """
    result = await db.execute(
        select(Interview).where(Interview.room_name == req.room_name)
    )
    interview = result.scalars().first()
    if not interview:
        raise HTTPException(status_code=404, detail="Room not found")

    if actor.is_candidate:
        if (interview.candidate_email or "").strip().lower() != actor.email:
            raise HTTPException(status_code=404, detail="Room not found")
        participant = actor.email.split("@", 1)[0]
    else:
        if interview.manager_id != actor.manager_id:
            raise HTTPException(status_code=404, detail="Room not found")
        participant = req.participant_name or "observer"

    token = create_livekit_token(req.room_name, participant)
    return {
        "token": token,
        "livekit_url": LIVEKIT_URL,
    }


@router.get("/interview-room-config/{room_name}")
async def get_room_config(
    room_name: str,
    db: AsyncSession = Depends(get_db),
    x_agent_token: Optional[str] = Header(default=None, alias="X-Agent-Token"),
):
    """Config for a room, fetched by the interview worker.

    This is a service-to-service call (the LiveKit worker has no browser session),
    so it uses the same X-Agent-Token shared secret as /save-transcript rather
    than a JWT. It was previously unauthenticated and returned the candidate's
    email, name, and resume-derived verification targets to anyone who knew a
    room name.
    """
    verify_agent_token(x_agent_token)

    # Try in-memory cache first (fast path)
    if room_name in room_configs:
        return room_configs[room_name]

    result = await db.execute(
        select(Interview).where(Interview.room_name == room_name)
    )
    interview = result.scalars().first()
    if interview and interview.room_config:
        room_configs[room_name] = interview.room_config  # Warm the cache
        return interview.room_config

    # Explicit 404 rather than a fabricated default config. Returning a generic
    # "Software Engineer / 5 questions" interview here meant a misconfigured room
    # silently produced a wrong-role interview that looked successful.
    raise HTTPException(status_code=404, detail="Room not found")


@router.get("/status")
async def livekit_status(actor: Actor = Depends(get_current_actor)):
    """Check LiveKit configuration status (authenticated — leaks the LiveKit URL)."""
    return {
        "configured": bool(LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET),
        "url": LIVEKIT_URL[:30] + "..." if LIVEKIT_URL else "not set",
        "active_rooms": len(room_configs),
    }
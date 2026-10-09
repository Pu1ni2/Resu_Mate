"""Which kind of interview this server can run.

Avatar interviews need the LiveKit interview worker (backend/interview_agent.py)
running somewhere. Render's free plan can't run it, and without it an avatar
interview never got its interviewer: the candidate waited in an empty room.
So they are offered only when AVATAR_INTERVIEWS is on and LiveKit and the
worker's shared secret are configured. Otherwise every interview runs as a
voice interview (OpenAI Realtime, straight from the browser), which needs no
worker.
"""
import os

from app.core.config import settings

AVATAR = "avatar"
VOICE = "conversational"


def avatar_available() -> bool:
    livekit = all(os.getenv(key) for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"))
    return bool(settings.avatar_interviews and livekit and settings.agent_shared_secret)


def effective_mode(requested) -> str:
    """The kind a new or unfinished interview runs as.

    A voice interview stays voice. Anything else is an avatar interview, which
    runs as voice when this server can't run avatars.
    """
    if (requested or "").strip().lower() == VOICE:
        return VOICE
    return AVATAR if avatar_available() else VOICE


def mode_of(interview) -> str:
    """What to call an interview's kind: a finished one keeps the kind it ran as."""
    if interview.status == "completed":
        return interview.mode or AVATAR
    return effective_mode(interview.mode)

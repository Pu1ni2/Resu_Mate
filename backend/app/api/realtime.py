"""Realtime (conversational) interview endpoints.

Mint an OpenAI Realtime ephemeral client secret so the candidate's browser can
open a WebRTC session directly to OpenAI. The candidate's mic and the model's
voice flow peer-to-peer; we never proxy audio. This route's job is just to
build the system prompt with the right interview config and exchange a server
secret for a short-lived client secret.

Adapted from innovate-Us/innovateus-feedback (apps/api/app/routers/realtime.py).
Stripped: topic-advance tool, multi-format scopes, resume-from-prior, cohort
resolver. ResuMate's interview shape is simpler — one fixed question list per
interview, ordered.
"""
import json
import logging
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.database import get_db
from app.models.candidate import CandidateAccess, Interview
from app.services.auth import get_current_user

logger = logging.getLogger("resumate.realtime")
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/realtime", tags=["Realtime"])

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"

# Allowlist so a typo in env vars surfaces as a clean 400 instead of an opaque
# "Realtime connection failed" inside the WebRTC layer. Update when OpenAI
# rolls new models / voices.
ALLOWED_MODELS = {
    "gpt-realtime-2",
    "gpt-realtime",
    "gpt-4o-realtime-preview",
    "gpt-4o-realtime-preview-2024-12-17",
    "gpt-4o-realtime-preview-2024-10-01",
    "gpt-4o-mini-realtime-preview",
}
ALLOWED_VOICES = {
    "alloy", "ash", "ballad", "coral", "echo", "marin",
    "sage", "shimmer", "verse", "breeze", "cinnamon", "ember", "juniper",
}


class RealtimeSessionRequest(BaseModel):
    interview_id: int = Field(..., description="Interview row id created beforehand")
    candidate_email: str = Field(..., max_length=320)


class RealtimeSessionResponse(BaseModel):
    client_secret: str
    expires_at: Optional[int] = None
    model: str
    voice: str
    instructions: str
    max_total_minutes: int
    remaining_minutes: int
    interview_id: int


def _load_prompt() -> str:
    with open(PROMPTS_DIR / "realtime_interview.txt", "r", encoding="utf-8") as f:
        return f.read()


def _build_instructions(interview: Interview, candidate_name: str, max_total_minutes: int) -> str:
    """Concatenate base prompt + a JSON context block.

    The model reads the JSON literally, so field names must stay stable —
    realtime_interview.txt references them by name (questions, num_questions,
    role, level, candidate_name, tone, verification_targets, remaining_minutes).
    """
    base = _load_prompt()
    questions = interview.questions or []
    # If the hiring manager never pre-generated questions, fall back to a
    # default 5-question role-aware list. The realtime model copes fine with
    # generic prompts; the report flow is the same shape regardless.
    if not questions:
        questions = [
            f"Walk me through your background and what drew you to {interview.role or 'this role'}.",
            "Tell me about a recent project you're proud of and your specific role in it.",
            "What's a technical challenge you hit recently, and how did you work through it?",
            "How do you stay current with new tools and approaches in your field?",
            "What kind of team and feedback style helps you do your best work?",
        ]

    # Resume-intelligence verification targets travel inside room_config so the
    # avatar interview's prompt builder can read the same shape. For the
    # conversational path we just surface them verbatim and let the prompt
    # decide whether to probe.
    verification_targets: List[dict] = []
    config = interview.room_config or {}
    if isinstance(config, dict):
        ri = config.get("resume_intelligence") or {}
        if isinstance(ri, dict):
            verification_targets = ri.get("verification_targets") or []

    context = {
        "candidate_name": candidate_name or "the candidate",
        "role": interview.role or "the role",
        "level": interview.level or "Mid-Level",
        "focus_areas": interview.focus_areas or [],
        "questions": questions,
        "num_questions": len(questions),
        "verification_targets": verification_targets[:4],
        "tone": "warm, sharp, direct, professional",
        "remaining_minutes": max_total_minutes,
    }
    return base + "\n\n```json\n" + json.dumps(context, ensure_ascii=False, indent=2) + "\n```\n"


@router.post("/session", response_model=RealtimeSessionResponse)
@limiter.limit("20/hour")
async def create_realtime_session(
    request: Request,
    req: RealtimeSessionRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),  # hiring manager OR candidate — both have tokens
):
    """Mint a short-lived OpenAI Realtime client secret for one interview."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key is not configured")

    model = (settings.realtime_model or "gpt-realtime-2").strip()
    voice = (settings.realtime_voice or "marin").strip()
    if model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"REALTIME_MODEL '{model}' is not allowed. Choose one of: {sorted(ALLOWED_MODELS)}",
        )
    if voice not in ALLOWED_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"REALTIME_VOICE '{voice}' is not allowed. Choose one of: {sorted(ALLOWED_VOICES)}",
        )

    # Find the interview row. Either id-match OR latest pending for this
    # candidate email — the candidate-portal flow doesn't always know the id.
    email = (req.candidate_email or "").strip().lower()
    result = await db.execute(
        select(Interview).where(Interview.id == req.interview_id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    if (interview.candidate_email or "").lower() != email:
        raise HTTPException(status_code=403, detail="Interview does not belong to this candidate")

    # Resolve the candidate's display name (falls back to access table or email local part).
    candidate_name = ""
    access_q = await db.execute(
        select(CandidateAccess).where(CandidateAccess.email == email)
    )
    access = access_q.scalars().first()
    if access and access.name:
        candidate_name = access.name
    elif interview.candidate and getattr(interview.candidate, "name", ""):
        candidate_name = interview.candidate.name
    else:
        candidate_name = email.split("@", 1)[0].replace(".", " ").title()

    max_total_minutes = int(settings.realtime_max_total_minutes or 8)
    remaining_minutes = max_total_minutes  # MVP: no rolling budget across sessions
    instructions = _build_instructions(interview, candidate_name, remaining_minutes)

    session_cfg = {
        "type": "realtime",
        "model": model,
        "instructions": instructions,
        "audio": {
            "input": {
                "transcription": {"model": "gpt-4o-transcribe", "language": "en"},
                # semantic_vad is the recommended default — energy VAD trips
                # on coughs, breaths, and background TV. "low" eagerness gives
                # the candidate more thinking time before the AI assumes the
                # turn is over (interviews involve real pauses).
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": "low",
                    "create_response": True,
                    "interrupt_response": True,
                },
            },
            "output": {"voice": voice},
        },
        # No tools for the MVP — questions are pre-ordered, no advance_to_next_topic.
        "tools": [],
        "tool_choice": "none",
    }
    if model == "gpt-realtime-2":
        session_cfg["reasoning"] = {"effort": "low"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                OPENAI_REALTIME_CLIENT_SECRETS_URL,
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={"session": session_cfg},
            )
    except Exception as exc:
        logger.exception("realtime client_secrets request failed")
        raise HTTPException(status_code=502, detail=f"OpenAI realtime request failed: {exc}")

    if resp.status_code >= 400:
        logger.warning("realtime client_secrets returned %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI {resp.status_code}: {resp.text[:300]}",
        )
    data = resp.json()

    # Tolerate both response shapes documented by OpenAI today.
    secret_value = data.get("value")
    expires_at = data.get("expires_at")
    if not secret_value:
        nested = data.get("client_secret") or {}
        secret_value = nested.get("value")
        expires_at = nested.get("expires_at")
    if not secret_value:
        raise HTTPException(status_code=502, detail="Realtime session response missing client secret")

    # Mark the interview as in-progress so the hiring manager dashboard sees it.
    interview.status = "in_progress"
    await db.commit()

    return RealtimeSessionResponse(
        client_secret=secret_value,
        expires_at=expires_at,
        model=data.get("model") or model,
        voice=voice,
        instructions=instructions,
        max_total_minutes=max_total_minutes,
        remaining_minutes=remaining_minutes,
        interview_id=interview.id,
    )


# ─── Checkpoint + finalize for the conversational room ───────────────────────


class CheckpointRequest(BaseModel):
    interview_id: int
    transcript: List[dict] = Field(default_factory=list, max_length=2000)


@router.post("/checkpoint")
async def checkpoint(
    req: CheckpointRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Save a rolling transcript every N user turns. Idempotent — overwrites."""
    result = await db.execute(select(Interview).where(Interview.id == req.interview_id))
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    interview.transcript = req.transcript
    interview.status = "in_progress"
    await db.commit()
    return {"saved": True, "turns": len(req.transcript)}


class FinalizeRequest(BaseModel):
    interview_id: int
    transcript: List[dict] = Field(default_factory=list, max_length=2000)
    duration: int = Field(default=0, ge=0, le=24 * 60 * 60)


@router.post("/finalize")
async def finalize(
    req: FinalizeRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """End the conversational interview, generate a report, mark completed.

    Reuses the same lightweight report flow as the avatar interview's
    /save-transcript endpoint — one OpenAI call over the joined transcript
    produces a short markdown report stored on interview.report. The hiring
    manager's existing get_interview_report path then just works for both
    modes.
    """
    from app.tools.openai_tool import openai_tool

    result = await db.execute(select(Interview).where(Interview.id == req.interview_id))
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    interview.transcript = req.transcript
    interview.duration = req.duration

    try:
        joined = "\n".join(
            f"[{t.get('role', '?')}] {t.get('text', '')}"
            for t in (req.transcript or [])
        )[:8000]
        prompt = (
            f"You're reviewing a recorded voice interview for the {interview.role or 'role'} position. "
            "Produce a short hiring report in markdown:\n\n"
            "## Interview Summary (2-3 sentences)\n"
            "## Strengths (2-3 bullets, evidence-backed)\n"
            "## Concerns (2-3 bullets, kind tone)\n"
            "## Recommendation (Strong Hire / Hire / Consider / Pass)\n\n"
            f"Transcript:\n{joined}"
        )
        report = await openai_tool.structured_call(
            prompt=prompt,
            system="You are a senior hiring manager. Be concise, fair, and evidence-grounded.",
        )
        if report:
            interview.report = report
    except Exception as exc:
        logger.warning("finalize: report generation failed: %s", exc)

    interview.status = "completed"
    await db.commit()

    # Notify the owning manager (best-effort, shared helper with /save-transcript).
    try:
        from app.api.chat import _notify_manager_interview_complete
        await _notify_manager_interview_complete(db, interview)
    except Exception as exc:
        logger.warning("finalize: manager notification failed: %s", exc)

    return {
        "saved": True,
        "turns": len(req.transcript),
        "report_generated": bool(interview.report),
    }

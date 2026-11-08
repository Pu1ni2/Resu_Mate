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
import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.rate_limit import limiter

from app.core.config import settings
from app.core.errors import log_text
from app.core.errors import friendly_error, friendly_status
from app.core.database import get_db
from app.models.candidate import CandidateAccess, Interview
from app.services import db_service
from app.services.consent import require_consent
from app.services.auth import Actor, get_current_actor
from app.services.interview_report import write_report
from app.services.interview_script import build_instructions

logger = logging.getLogger("resumate.realtime")

router = APIRouter(prefix="/realtime", tags=["Realtime"])

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


# What the candidate is told when OpenAI won't open their session.
INTERVIEW_NOT_STARTED = "The interview couldn't be started."
# And when their interview has used all the time it had.
TIME_USED_UP = "This interview has used all its time, so it's now complete."


class RealtimeSessionRequest(BaseModel):
    interview_id: int = Field(..., description="Interview row id created beforehand")
    candidate_email: str = Field(..., max_length=320)
    # The candidate confirmed they understand how the interview works.
    consent: bool = False


class RealtimeSessionResponse(BaseModel):
    client_secret: str
    expires_at: Optional[int] = None
    model: str
    voice: str
    instructions: str
    max_total_minutes: int
    remaining_minutes: int
    interview_id: int
    # An interrupted interview's conversation and length so far, which this
    # session continues; empty and 0 for one starting fresh.
    transcript: List[dict] = Field(default_factory=list)
    elapsed_seconds: int = 0


async def _authorized_interview(db: AsyncSession, actor: Actor, interview_id: int) -> Interview:
    """Return the interview this actor may act on, or raise.

    None of these three endpoints checked ownership. They looked the interview
    up by id and wrote to it, so any authenticated caller could overwrite any
    other tenant's transcript, or finalise their interview and trigger report
    generation on it, just by passing a different integer.

    A candidate is matched on their TOKEN email, never a body field. A manager is
    matched on manager_id. Mismatches 404 rather than 403 so the response does
    not confirm that an interview with that id exists elsewhere.
    """
    # With its candidate: reading interview.candidate later would load it
    # lazily, which an async session can't do, and the request crashed.
    result = await db.execute(
        select(Interview).options(selectinload(Interview.candidate)).where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if actor.is_candidate:
        if (interview.candidate_email or "").strip().lower() != actor.email:
            raise HTTPException(status_code=404, detail="Interview not found")
    else:
        # Legacy rows with a NULL manager_id are owned by nobody and therefore
        # invisible — the same safe default used elsewhere in the app.
        if interview.manager_id is None or interview.manager_id != actor.manager_id:
            raise HTTPException(status_code=404, detail="Interview not found")

    return interview


def _refuse_if_completed(interview: Interview) -> None:
    """A finished interview stays finished.

    /session and /checkpoint both set status back to "in_progress" with no
    check, so the candidate could reopen a completed interview, overwrite its
    transcript and finalise again to get a fresh report.
    """
    if interview.status == "completed":
        raise HTTPException(status_code=409, detail="This interview is already complete.")

@router.post("/session", response_model=RealtimeSessionResponse)
@limiter.limit("20/hour")
async def create_realtime_session(
    request: Request,
    req: RealtimeSessionRequest,
    db: AsyncSession = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
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

    # The comment here used to claim "hiring manager OR candidate", but the
    # dependency was get_current_user, which rejects type=candidate tokens — so
    # the candidate path this endpoint exists for could not authenticate at all.
    # It now takes either, and the ownership check lives in one place.
    interview = await _authorized_interview(db, actor, req.interview_id)
    _refuse_if_completed(interview)
    require_consent(interview, req.consent)
    email = (interview.candidate_email or "").strip().lower()

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

    # What the interview already holds, when it was interrupted or a session
    # dropped after a checkpoint: this session carries on from there, and the
    # time it has is what's left.
    so_far = [t for t in (interview.transcript or []) if isinstance(t, dict)]
    elapsed = int(interview.duration or 0) if so_far else 0
    max_total_minutes = int(settings.realtime_max_total_minutes or 8)
    # One that has had all its time ends here, on what was said, rather than
    # opening again: every new session gave it more.
    if elapsed >= max_total_minutes * 60:
        await _complete(db, interview, so_far, elapsed)
        raise HTTPException(status_code=409, detail=TIME_USED_UP)
    remaining_minutes = max(1, max_total_minutes - elapsed // 60)
    instructions = build_instructions(interview, candidate_name, remaining_minutes, so_far=so_far)

    session_cfg = {
        "type": "realtime",
        "model": model,
        "instructions": instructions,
        "audio": {
            "input": {
                "transcription": {"model": settings.transcription_model, "language": "en"},
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
        logger.error("realtime client_secrets request failed: %s", log_text(exc))
        raise HTTPException(status_code=502, detail=friendly_error(exc, INTERVIEW_NOT_STARTED))

    if resp.status_code >= 400:
        # OpenAI's own words, for us; the candidate saw them too.
        logger.warning("realtime client_secrets returned %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=502, detail=friendly_status(resp.status_code, INTERVIEW_NOT_STARTED))
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
        transcript=so_far,
        elapsed_seconds=elapsed,
    )


# ─── Checkpoint + finalize for the conversational room ───────────────────────


class CheckpointRequest(BaseModel):
    interview_id: int
    transcript: List[dict] = Field(default_factory=list, max_length=2000)


@router.post("/checkpoint")
@limiter.limit("120/hour")
async def checkpoint(
    request: Request,
    req: CheckpointRequest,
    db: AsyncSession = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
):
    """Save a rolling transcript every N user turns. Idempotent — overwrites."""
    interview = await _authorized_interview(db, actor, req.interview_id)
    _refuse_if_completed(interview)
    interview.transcript = req.transcript
    interview.status = "in_progress"
    await db.commit()
    return {"saved": True, "turns": len(req.transcript)}


class InterruptRequest(BaseModel):
    interview_id: int
    transcript: List[dict] = Field(default_factory=list, max_length=2000)
    # The interview's length so far, in seconds, every session of it.
    duration: int = Field(default=0, ge=0, le=24 * 60 * 60)


@router.post("/interrupt")
@limiter.limit("30/hour")
async def interrupt(
    request: Request,
    req: InterruptRequest,
    db: AsyncSession = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
):
    """Keep what an interrupted voice interview captured, to carry on later.

    A lost connection or a closed page ended the interview through /finalize:
    it was completed, with a report written on part of it, and the fresh
    start the room told the candidate to make was refused. Now it's kept as
    "interrupted", with its transcript and length so far, and the candidate's
    next session continues it (create_realtime_session).
    """
    interview = await _authorized_interview(db, actor, req.interview_id)
    _refuse_if_completed(interview)
    if req.transcript:
        interview.transcript = req.transcript
    if req.duration:
        interview.duration = req.duration
    interview.status = "interrupted"
    await db.commit()
    return {"saved": True, "status": interview.status, "turns": len(interview.transcript or [])}


class FinalizeRequest(BaseModel):
    interview_id: int
    transcript: List[dict] = Field(default_factory=list, max_length=2000)
    duration: int = Field(default=0, ge=0, le=24 * 60 * 60)


@router.post("/finalize")
@limiter.limit("10/hour")
async def finalize(
    request: Request,
    req: FinalizeRequest,
    db: AsyncSession = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
):
    """End the conversational interview, generate a report, mark completed.

    The report is written as the avatar interview's /save-transcript writes
    it (app/services/interview_report.py) and stored on interview.report. The
    hiring manager's existing get_interview_report path then just works for
    both modes.
    """
    interview = await _authorized_interview(db, actor, req.interview_id)

    # Finalising twice (a retry after a dropped response) returns what was
    # saved. It must not regenerate the report from a transcript sent again.
    if interview.status == "completed":
        return {
            "saved": False,
            "already_completed": True,
            "turns": len(interview.transcript or []),
            "report_generated": bool(interview.report),
        }

    await _complete(db, interview, req.transcript, req.duration)
    return {
        "saved": True,
        "turns": len(req.transcript),
        "report_generated": bool(interview.report),
    }


async def _complete(db: AsyncSession, interview: Interview, transcript: list, duration: int) -> None:
    """Finish a voice interview: its transcript, its report and its finish
    date saved, and its manager told."""
    interview.transcript = transcript

    try:
        report = await write_report(transcript, interview.role)
        if report:
            db_service.merge_interview_report(interview, {"report": report})
    except Exception as exc:
        logger.warning("finalize: report generation failed: %s", type(exc).__name__)

    db_service.finish_interview(interview, duration)
    await db.commit()

    # Notify the owning manager (best-effort, shared helper with /save-transcript).
    try:
        from app.api.chat import _notify_manager_interview_complete
        await _notify_manager_interview_complete(db, interview)
    except Exception as exc:
        logger.warning("finalize: manager notification failed: %s", type(exc).__name__)

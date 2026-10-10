"""
Screening pipeline API
Orchestrates ATS scoring, candidate shortlisting, and batch interview/email actions.
"""
import json
import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rate_limit import limiter

from app.core.config import settings
from app.core.database import get_db
from app.services.auth import get_current_user
from app.services.ats_service import ats_service
from app.services.resume_rag import resume_rag, primary_email
from app.services import db_service
from app.services import interview_modes
from app.agents.hr_agent import hr_agent
from app.services.email_service import email_service
from app.models.candidate import Interview

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


# ── Request models ────────────────────────────────────────────────────────────

class PipelineRunRequest(BaseModel):
    role: str
    jd_text: Optional[str] = None
    min_experience_years: float = 0
    required_skills: list = []
    candidate_ids: Optional[list] = None   # None = all candidates
    auto_shortlist_count: int = 5


class BatchActionRequest(BaseModel):
    candidate_ids: list
    role: str
    level: str = "Mid-Level"
    num_questions: int = 8
    focus_areas: list = []
    email_type: str = "interview"          # interest | interview
    send_emails: bool = False              # must be explicitly True to send
    # Interview format applied to every interview created in this batch:
    # "avatar"          — existing LiveKit + Simli avatar flow (default).
    # "conversational"  — audio-only OpenAI Realtime (no camera, no avatar).
    mode: str = "avatar"


class InviteDraft(BaseModel):
    interview_id: int
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10_000)


class SendInvitesRequest(BaseModel):
    invites: List[InviteDraft] = Field(..., min_length=1, max_length=100)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/run")
@limiter.limit("10/hour")
async def run_pipeline(request: Request, req: PipelineRunRequest, user=Depends(get_current_user)):
    """
    Main screening pipeline.
    Scores all (or specified) candidates via the ATS engine and returns ranked results.
    """
    # 1. Resolve candidate pool — only THIS manager's candidates.
    all_candidates = resume_rag.get_all_candidates(manager_id=user.id)
    if req.candidate_ids:
        pool = [c for c in all_candidates if c.get("id") in req.candidate_ids]
    else:
        pool = all_candidates

    if not pool:
        raise HTTPException(400, "No candidates found. Please upload resumes first.")

    # 2. Parse JD (if provided)
    if req.jd_text and req.jd_text.strip():
        jd_requirements = await ats_service.parse_jd(req.jd_text, req.role)
    else:
        # No JD — build minimal requirements from caller-supplied fields
        jd_requirements = {
            "required_skills": req.required_skills,
            "nice_to_have_skills": [],
            "min_experience_years": req.min_experience_years,
            "education_requirement": "",
            "seniority_level": "",
            "role_keywords": req.role.lower().split(),
        }

    # 3. Run ATS scoring on all candidates concurrently.
    #    Timed with perf_counter so the UI can state how long a run took. Only
    #    the scoring is measured, not JD parsing above -- the claim shown is
    #    "ranked in Xs", and folding an optional LLM call into that number would
    #    make it mean something different depending on whether a JD was pasted.
    _t0 = time.perf_counter()
    results = await ats_service.run_ats_pipeline(
        pool,
        jd_requirements,
        role=req.role,
        min_experience_years=req.min_experience_years,
        required_skills=req.required_skills,
    )

    elapsed_ms = int((time.perf_counter() - _t0) * 1000)

    # 4. Bucket stats
    stats = {"strong_fit": 0, "good_fit": 0, "consider": 0, "no_match": 0}
    for r in results:
        v = r["verdict"]
        if v == "Strong Fit":
            stats["strong_fit"] += 1
        elif v == "Good Fit":
            stats["good_fit"] += 1
        elif v == "Consider":
            stats["consider"] += 1
        else:
            stats["no_match"] += 1

    # 5. Auto shortlist = top N non-rejected
    shortlist = [r for r in results if not r["auto_reject"]][:req.auto_shortlist_count]

    return {
        "role": req.role,
        "total_screened": len(results),
        "elapsed_ms": elapsed_ms,
        "jd_requirements": jd_requirements,
        "results": results,
        "shortlist": shortlist,
        "stats": stats,
    }


@router.post("/batch-action")
@limiter.limit("20/hour")
async def batch_action(
    request: Request,
    req: BatchActionRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    For each shortlisted candidate:
    - Creates an interview record in DB
    - Drafts an invitation email (via HR Agent)
    - Optionally sends the email (only if send_emails=True)

    Returns list of per-candidate results including email drafts.
    """
    outcomes = []
    mgr = user.id

    for cid in req.candidate_ids:
        # Only act on THIS manager's candidates.
        candidate = resume_rag.get_candidate(cid, manager_id=mgr)
        if not candidate:
            outcomes.append({"candidate_id": cid, "error": "Candidate not found"})
            continue

        # The résumé's own address, as the portal matches it. This read
        # candidate["email"], which an upload usually doesn't set, so the
        # interview and the portal grant went to an empty address while the
        # manager was told the candidate was invited.
        email = primary_email(candidate)
        name = candidate.get("name", "Candidate")
        result = {"candidate_id": cid, "name": name, "email": email}
        if not email:
            result.update(interview_created=False, email_sent=False,
                          skipped="No email address on this résumé, so they can't be invited.")
            outcomes.append(result)
            continue

        # ── Create interview record (owned by this manager) ───────────────────
        try:
            interview = await db_service.create_interview(db, {
                "candidate_id": cid,
                "manager_id": mgr,
                "candidate_email": email,
                "role": req.role,
                "level": req.level,
                "num_questions": req.num_questions,
                "focus_areas": req.focus_areas,
                # Voice when avatar interviews aren't set up here.
                "mode": interview_modes.effective_mode(req.mode),
            })
            if interview is None:
                raise RuntimeError("the interview could not be saved")
            # Grant portal access (owned by this manager)
            await db_service.create_candidate_access(db, email, name, cid, manager_id=mgr)
            result["interview_created"] = True
            result["interview_id"] = interview.id
            result["mode"] = interview.mode
        except Exception as e:
            result["interview_created"] = False
            result["interview_error"] = str(e)

        # ── Draft email via HR Agent ──────────────────────────────────────────
        try:
            email_result = await hr_agent.draft_email(
                candidate=candidate,
                email_type=req.email_type,
                evaluation_report=f"Role: {req.role} | Level: {req.level}",
                anonymize=False,
            )
            subject = email_result.get("subject", f"Interview Invitation — {req.role}")
            body = email_result.get("body", "")
            result["email_subject"] = subject
            result["email_body"] = body
            result["email_drafted"] = True
        except Exception as e:
            result["email_drafted"] = False
            result["email_error"] = str(e)
            subject = f"Interview Invitation — {req.role}"
            body = (
                f"Dear {name},\n\n"
                f"We are pleased to invite you to interview for the {req.role} position.\n\n"
                f"Please log in to your candidate portal to access your interview.\n\n"
                f"Best regards,\nHiring Team"
            )
            result["email_subject"] = subject
            result["email_body"] = body

        # ── Send email (only if explicitly requested) ─────────────────────────
        # Only for a saved interview: an invite to one that wasn't saved
        # sent the candidate to a portal with nothing for them.
        result["email_sent"] = False
        if req.send_emails and result["interview_created"]:
            if not email_service.configured:
                result["email_send_error"] = "Email isn't set up on this server. Share the portal link instead."
            else:
                try:
                    sent = await email_service.send_interview_invitation(
                        email, name, req.role, settings.candidate_login_url
                    )
                    result["email_sent"] = sent
                    if not sent:
                        result["email_send_error"] = "The email service didn't accept this invite."
                except Exception as e:
                    result["email_send_error"] = str(e)

        outcomes.append(result)

    sent_count = sum(1 for o in outcomes if o.get("email_sent"))
    created_count = sum(1 for o in outcomes if o.get("interview_created"))

    return {
        "total": len(req.candidate_ids),
        "interviews_created": created_count,
        "emails_sent": sent_count,
        "skipped": sum(1 for o in outcomes if o.get("skipped")),
        # Where invited candidates sign in, for the manager to share when
        # an invite wasn't emailed.
        "portal_link": settings.candidate_login_url,
        "outcomes": outcomes,
    }


@router.post("/send-invites")
@limiter.limit("20/hour")
async def send_invites(
    request: Request,
    req: SendInvitesRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Email each candidate the invitation draft the manager reviewed.

    Jarvis's Send button ran the batch action again, so every interview was
    created a second time, and what went out was a fixed template rather than
    the draft on screen. This sends the drafts for interviews already made.
    """
    if not email_service.configured:
        raise HTTPException(503, "Email isn't set up on this server. Share the portal link instead.")

    outcomes, seen = [], set()
    for draft in req.invites:
        if draft.interview_id in seen:
            continue
        seen.add(draft.interview_id)
        outcome = {"interview_id": draft.interview_id, "email_sent": False}
        # Only this manager's interviews, as everywhere else.
        interview = (await db.execute(
            select(Interview).where(Interview.id == draft.interview_id, Interview.manager_id == user.id)
        )).scalar_one_or_none()
        if interview is None:
            outcome["error"] = "Interview not found"
        elif interview.status == "completed":
            outcome["email"] = interview.candidate_email
            outcome["error"] = "This interview is already complete."
        else:
            outcome["email"] = interview.candidate_email
            outcome["email_sent"] = await email_service.send_email_draft(
                interview.candidate_email, draft.subject, draft.body, settings.candidate_login_url,
            )
            if not outcome["email_sent"]:
                outcome["error"] = "The email service didn't accept this invite."
        outcomes.append(outcome)

    return {
        "emails_sent": sum(1 for o in outcomes if o["email_sent"]),
        "portal_link": settings.candidate_login_url,
        "outcomes": outcomes,
    }

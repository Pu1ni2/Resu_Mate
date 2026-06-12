"""
AutoHire Pipeline API
Orchestrates ATS scoring, candidate shortlisting, and batch interview/email actions.
"""
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.services.auth import get_current_user
from app.services.ats_service import ats_service
from app.services.resume_rag import resume_rag
from app.services import db_service
from app.agents.hr_agent import hr_agent
from app.services.email_service import email_service

router = APIRouter(prefix="/pipeline", tags=["pipeline"])
limiter = Limiter(key_func=get_remote_address)


# ── Request models ────────────────────────────────────────────────────────────

class ParseJDRequest(BaseModel):
    jd_text: str
    role: str = ""


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
    # "avatar"          â€” existing LiveKit + Simli avatar flow (default).
    # "conversational"  â€” audio-only OpenAI Realtime (no camera, no avatar).
    mode: str = "avatar"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/parse-jd")
async def parse_jd(req: ParseJDRequest, user=Depends(get_current_user)):
    """Parse a job description into structured requirements."""
    requirements = await ats_service.parse_jd(req.jd_text, req.role)
    return {"requirements": requirements}


@router.post("/run")
@limiter.limit("10/hour")
async def run_pipeline(request: Request, req: PipelineRunRequest, user=Depends(get_current_user)):
    """
    Main AutoHire pipeline.
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

    # 3. Run ATS scoring on all candidates concurrently
    results = await ats_service.run_ats_pipeline(
        pool,
        jd_requirements,
        role=req.role,
        min_experience_years=req.min_experience_years,
        required_skills=req.required_skills,
    )

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

        email = candidate.get("email", "")
        name = candidate.get("name", "Candidate")
        result = {"candidate_id": cid, "name": name, "email": email}

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
                "mode": (req.mode or "avatar").strip().lower(),
            })
            # Grant portal access (owned by this manager)
            await db_service.create_candidate_access(db, email, name, cid, manager_id=mgr)
            result["interview_created"] = True
            result["interview_id"] = interview.id if interview else None
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
        result["email_sent"] = False
        if req.send_emails and email:
            try:
                login_url = "http://localhost:5173/candidate/login"
                sent = await email_service.send_interview_invitation(
                    email, name, req.role, login_url
                )
                result["email_sent"] = sent
            except Exception as e:
                result["email_send_error"] = str(e)

        outcomes.append(result)

    sent_count = sum(1 for o in outcomes if o.get("email_sent"))
    created_count = sum(1 for o in outcomes if o.get("interview_created"))

    return {
        "total": len(req.candidate_ids),
        "interviews_created": created_count,
        "emails_sent": sent_count,
        "outcomes": outcomes,
    }

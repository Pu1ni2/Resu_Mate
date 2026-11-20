"""
Screening pipeline API
Orchestrates ATS scoring, candidate shortlisting, and batch interview/email actions.
"""
import json
import time
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rate_limit import limiter

from app.core.config import settings
from app.core.database import get_db
from app.services.auth import get_current_user
from app.services.ats_service import ats_service, assessed_parts, JDParseError
from app.services.resume_rag import reading, resume_rag
from app.services import email_kinds, email_quota, interview_modes, invite_batches, outbox, screening_runs
from app.services.email_service import email_service
from app.models.candidate import Interview
from app.models.screening import ScreeningRun

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


# ── Request models ────────────────────────────────────────────────────────────

class PipelineRunRequest(BaseModel):
    role: str
    jd_text: Optional[str] = None
    min_experience_years: float = 0
    required_skills: list = []
    candidate_ids: Optional[list] = None   # None = all candidates
    auto_shortlist_count: int = 5


class BatchRequest(BaseModel):
    """A batch invitation (POST /batches): the batch action's settings, the
    confirm dialog's own key, and where it was asked from."""
    # One per Confirm on the page: asking again with it is the same batch.
    client_key: str = Field(..., min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    source: Literal["screening", "jarvis"] = "screening"
    candidate_ids: List[int]
    role: str = Field(..., max_length=200)
    level: str = Field("Mid-Level", max_length=50)
    num_questions: int = Field(8, ge=1, le=25)
    focus_areas: list = Field(default_factory=list, max_length=20)
    email_type: str = Field("interview", max_length=32)
    send_emails: bool = False
    mode: str = Field("avatar", max_length=20)


class InviteDraft(BaseModel):
    interview_id: int
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10_000)


class SendInvitesRequest(BaseModel):
    invites: List[InviteDraft] = Field(..., min_length=1, max_length=100)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/run")
@limiter.limit("10/hour")
async def run_pipeline(request: Request, req: PipelineRunRequest, user=Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    """
    Main screening pipeline.
    Scores all (or specified) candidates via the ATS engine and returns ranked results.
    The run is kept, to be opened again by its run_id (GET /pipeline/runs/{id}).
    """
    # 1. Resolve candidate pool — only THIS manager's candidates.
    all_candidates = resume_rag.get_all_candidates(manager_id=user.id)
    if req.candidate_ids:
        pool = [c for c in all_candidates if c.get("id") in req.candidate_ids]
    else:
        pool = all_candidates

    if not pool:
        raise HTTPException(400, "No candidates found. Please upload resumes first.")
    if not req.role.strip():
        raise HTTPException(400, "Name the role to screen for.")

    # Only analysed résumés are screened. A file that isn't a résumé, or whose
    # analysis failed, was ranked like the rest from its empty fields, and so
    # would one the AI is still reading (app/services/resume_analysis.py).
    screenable = [c for c in pool if c.get("is_resume") is not False and not c.get("analysis_failed")
                  and not reading(c)]
    excluded = len(pool) - len(screenable)
    if not screenable:
        raise HTTPException(400, "None of these files can be screened: they aren't résumés, their analysis "
                                 "failed, or they're still being read.")
    pool = screenable

    # 2. Parse JD (if provided)
    if req.jd_text and req.jd_text.strip():
        try:
            jd_requirements = await ats_service.parse_jd(req.jd_text, req.role)
        except JDParseError:
            # Screening on without it would ignore the description and say nothing.
            raise HTTPException(
                502,
                "The job description couldn't be read just now. Try again, or enter the must-have skills instead.",
            )
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

    response = {
        "role": req.role,
        "total_screened": len(results),
        "elapsed_ms": elapsed_ms,
        # What the scores are made of: with only "role", they compare roles,
        # not skills or experience, and the results say so.
        "assessed": results[0]["assessed"] if results else assessed_parts(jd_requirements, req.role),
        "excluded": excluded,
        "jd_requirements": jd_requirements,
        "results": results,
        "shortlist": shortlist,
        "stats": stats,
    }
    # Kept, so leaving the results or refreshing doesn't mean screening again.
    # A run that can't be kept is still answered.
    try:
        response["run_id"] = await screening_runs.save(db, user.id, response)
    except Exception as exc:
        await db.rollback()
        print(f"[WARN] screening run not kept: {type(exc).__name__}")
        response["run_id"] = None
    return response


@router.get("/runs")
async def list_runs(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """This manager's kept screening runs, newest first."""
    rows = (await db.execute(
        select(ScreeningRun).where(ScreeningRun.manager_id == user.id)
        .order_by(ScreeningRun.created_at.desc(), ScreeningRun.id.desc())
    )).scalars().all()
    return {"runs": [screening_runs.summary(run) for run in rows]}


@router.get("/runs/{run_id}")
async def open_run(run_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """A kept screening run, as /run answered it, with today's candidates."""
    run = await db.get(ScreeningRun, run_id)
    if not run or run.manager_id != user.id:
        raise HTTPException(404, "Screening run not found")
    return screening_runs.opened(run, user.id)


@router.post("/batches", status_code=202)
@limiter.limit("20/hour")
async def start_batch(
    request: Request,
    req: BatchRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite several candidates at once, from the screening results or the
    assistant. It answers at once: each candidate's interview, questions,
    draft and email are made by a background job (app/services/
    invite_batches.py), and GET /batches/{id} follows them. Asking again
    with the same client_key answers with the batch it made, so a second
    click or a retry invites no one twice."""
    ids = list(dict.fromkeys(req.candidate_ids))
    if not ids:
        raise HTTPException(400, "Choose at least one candidate to invite.")
    if len(ids) > invite_batches.MAX_CANDIDATES:
        raise HTTPException(400, f"Invite up to {invite_batches.MAX_CANDIDATES} candidates at a time.")
    batch = await invite_batches.start(
        db, user.id, client_key=req.client_key, candidate_ids=ids, source=req.source,
        role=req.role.strip(), level=req.level.strip() or "Mid-Level", num_questions=req.num_questions,
        focus_areas=req.focus_areas, email_type=req.email_type, send_emails=req.send_emails,
        # Voice when avatar interviews aren't set up here.
        mode=interview_modes.effective_mode(req.mode),
    )
    return await invite_batches.view(db, batch)


@router.get("/batches/{batch_id}")
async def batch_progress(batch_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """A batch invitation as it goes: each candidate's outcome, the totals,
    and whether every one has finished. Only the manager's own."""
    batch = await invite_batches.find(db, user.id, batch_id=batch_id)
    if batch is None:
        raise HTTPException(404, "Batch not found")
    return await invite_batches.view(db, batch)


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
    the draft on screen. This sends the drafts for interviews already made:
    each is queued with its words, its place in the day's limit held at once,
    and the outbox's job sends it (GET /api/emails follows it). They went
    inside this request, counted only once gone. One invitation per
    interview: Send again, and nothing more is queued.
    """
    if not email_service.configured:
        raise HTTPException(503, "Email isn't set up on this server. Share the portal link instead.")

    outcomes, seen = [], set()
    for draft in req.invites:
        if draft.interview_id in seen:
            continue
        seen.add(draft.interview_id)
        outcome = {"interview_id": draft.interview_id, "email_id": None, "status": "refused"}
        # Only this manager's interviews, as everywhere else.
        interview = (await db.execute(
            select(Interview).where(Interview.id == draft.interview_id, Interview.manager_id == user.id)
        )).scalar_one_or_none()
        if interview is None:
            outcome["error"] = "Interview not found"
        elif interview.status == "completed":
            outcome["email"] = interview.candidate_email
            outcome["error"] = "This interview is already complete."
        elif refused := await email_quota.reserve(db, user):
            outcome["email"] = interview.candidate_email
            outcome["error"] = refused
        else:
            outcome["email"] = interview.candidate_email
            email_id = await outbox.queue(db, "invitation_draft", manager_id=user.id, interview_id=interview.id,
                                          subject=draft.subject, body=draft.body, counts_to_quota=True,
                                          dedupe_key=email_kinds.invite_key(interview.id))
            if email_id is None:
                outcome["error"] = email_kinds.ALREADY_INVITED
            else:
                outcome.update(email_id=email_id, status="queued", error=None)
        # Each place held, and each email queued, one draft at a time.
        await db.commit()
        outcomes.append(outcome)

    return {
        "emails_queued": sum(1 for o in outcomes if o["status"] == "queued"),
        "portal_link": settings.candidate_login_url,
        "outcomes": outcomes,
    }

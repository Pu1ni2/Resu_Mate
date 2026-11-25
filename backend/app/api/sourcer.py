"""
Candidate sourcer API
Starts a sourcing run (find people, write a judgement on every one), which a
background job runs and writes as it goes (app/services/sourcing_search.py),
and keeps its results for the manager who ran it.
"""
import re
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from app.core.rate_limit import limiter
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.hr_agent import hr_agent
from app.core.database import get_db
from app.models.sourcing import SourcingRun, SourcedProfile
from app.services import db_service, jobs, sourcing_search
from app.services.auth import get_current_user
from app.services.hidden_names import hides_names, scrub

router = APIRouter(prefix="/api/sourcer", tags=["sourcer"])


# ── Request models ────────────────────────────────────────────────────────────

class Sources(BaseModel):
    uploads: bool = True
    github: bool = True
    web: bool = True


class RunRequest(BaseModel):
    description: str = Field(..., max_length=2000)
    sources: Sources = Sources()


class StatusRequest(BaseModel):
    status: Literal["new", "saved", "dismissed"]


async def _own_run(db: AsyncSession, run_id: int, manager_id: int) -> SourcingRun:
    """The run if this manager owns it. Another manager's run is a 404, not a
    403, so ids can't be probed for existence."""
    result = await db.execute(
        select(SourcingRun).where(SourcingRun.id == run_id, SourcingRun.manager_id == manager_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")
    return run


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/runs", status_code=202)
@limiter.limit("10/hour")
async def start_run(request: Request, req: RunRequest, user=Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    """Find people for a description and judge every one: answered at once
    with the run, queued, which a background job runs, writing it as it goes
    (sourcing.search); the page follows it (GET /runs/{id}/progress). It ran
    inside this request, streamed, and stopped when the page closed.

    One at a time for each manager: while one is under way, 409 with its id.
    """
    description = req.description.strip()
    if len(description) < 3:
        raise HTTPException(400, "Describe who you're looking for.")
    sources = req.sources.model_dump()
    if not any(sources.values()):
        raise HTTPException(400, "Choose at least one place to look.")
    under_way = (await db.execute(
        select(SourcingRun.id).where(SourcingRun.manager_id == user.id, SourcingRun.status.in_(sourcing_search.ACTIVE))
    )).scalars().first()
    if under_way is not None:
        return JSONResponse(status_code=409, content={
            "detail": "A search is already running. It’s in Past searches, where you can open or stop it.",
            "run_id": under_way,
        })
    run = SourcingRun(manager_id=user.id, description=description, status="queued", sources=sources)
    db.add(run)
    await db.flush()
    await jobs.enqueue(db, sourcing_search.SEARCH, {"run_id": run.id}, manager_id=user.id)
    await db.commit()
    return {"run_id": run.id, "status": run.status}


@router.get("/runs")
async def list_runs(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """This manager's runs, newest first, for the history list."""
    result = await db.execute(
        select(SourcingRun)
        .where(SourcingRun.manager_id == user.id)
        .order_by(SourcingRun.created_at.desc(), SourcingRun.id.desc())
        .limit(50)
    )
    return {"runs": [
        {
            "id": run.id,
            "description": (run.description or "")[:200],
            "status": run.status,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "judged": (run.stats or {}).get("judged", 0),
            "shortlisted": (run.stats or {}).get("shortlisted", 0),
        }
        for run in result.scalars().all()
    ]}


@router.get("/runs/{run_id}")
async def get_run(run_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """A saved run with everyone it judged, best first, to reopen it as it ended."""
    run = await _own_run(db, run_id, user.id)
    result = await db.execute(
        select(SourcedProfile)
        .where(SourcedProfile.run_id == run.id, SourcedProfile.manager_id == user.id)
        .order_by(SourcedProfile.score.desc(), SourcedProfile.id)
    )
    return {"run": run.to_dict(), "profiles": [p.to_dict() for p in result.scalars().all()]}


@router.get("/runs/{run_id}/progress")
async def run_progress(run_id: int, after: int = 0, user=Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    """Where a run stands, and the people it found or judged since its write
    `after` (SourcingRun.seq), in the order written: everyone, when `after`
    is 0. The background job writes a run as it goes (sourcing.search),
    and a page following one asks after the last write it saw, until the
    run has ended."""
    run = await _own_run(db, run_id, user.id)
    since = (SourcedProfile.seq > after,) if after else ()
    result = await db.execute(
        select(SourcedProfile)
        .where(SourcedProfile.run_id == run.id, *since)
        .order_by(SourcedProfile.seq, SourcedProfile.id)
    )
    return {"run": run.to_dict(), "profiles": [p.to_dict() for p in result.scalars().all()]}


@router.post("/runs/{run_id}/stop")
async def stop_run(run_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Stop a search: one waiting to run never runs, and a running one ends
    at its next write, within a second or so, keeping everyone it found.
    One that has ended, or was asked already, is left as it is. Answers
    where it stands."""
    run = await _own_run(db, run_id, user.id)
    for was, now in (("queued", {"status": "stopped", "finished_at": datetime.utcnow()}),
                     ("running", {"status": "stopping"})):
        await db.execute(update(SourcingRun).where(SourcingRun.id == run.id, SourcingRun.status == was)
                         .values(**now).execution_options(synchronize_session=False))
    await db.commit()
    await db.refresh(run)
    return {"run_id": run.id, "status": run.status}


async def _own_profile(db: AsyncSession, profile_id: int, manager_id: int) -> SourcedProfile:
    """The profile if this manager's run judged it; otherwise 404, as for runs."""
    result = await db.execute(
        select(SourcedProfile).where(SourcedProfile.id == profile_id, SourcedProfile.manager_id == manager_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


@router.post("/profiles/{profile_id}/status")
async def set_profile_status(profile_id: int, req: StatusRequest,
                             user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Save someone to follow up with, dismiss them, or put them back to new."""
    profile = await _own_profile(db, profile_id, user.id)
    profile.status = req.status
    await db.commit()
    return {"profile": profile.to_dict()}


@router.delete("/runs/{run_id}")
async def delete_run(run_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Delete a run and everyone it judged, and record that it was done."""
    run = await _own_run(db, run_id, user.id)
    # Children first, as explicit statements: an ORM cascade would lazy-load the
    # profiles collection, which an async session can't do implicitly.
    removed = await db.execute(
        delete(SourcedProfile).where(SourcedProfile.run_id == run.id, SourcedProfile.manager_id == user.id)
    )
    await db.execute(delete(SourcingRun).where(SourcingRun.id == run.id))
    await db.commit()
    await db_service.log_event(
        db, "sourcing.delete", actor="manager", manager_id=user.id,
        detail=f"run {run_id}, {removed.rowcount} profiles",
    )
    return {"deleted": run_id}


@router.post("/profiles/{profile_id}/draft-outreach")
@limiter.limit("30/hour")
async def draft_outreach(request: Request, profile_id: int,
                         user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Draft a first message to someone a run found. A draft only: nothing is sent.

    With names hidden, the AI is told neither their name nor anything that
    names them: what it reads of them is cleaned as the judge's is, and it
    greets them "Hi there". Their first name goes into the greeting here,
    after it has written it."""
    profile = await _own_profile(db, profile_id, user.id)
    run = await _own_run(db, profile.run_id, user.id)
    plan = run.plan or {}
    title = (plan.get("req") or {}).get("title") or "a role"
    labels = {c.get("id"): c.get("label") for c in plan.get("criteria") or []}
    # What the judge actually saw, so the note cites real work, not a guess.
    evidence = [
        f"{labels.get(a.get('id'), a.get('id'))}: {a.get('value')}"
        for a in profile.criteria or []
        if a.get("level") in ("strong", "partial") and a.get("value")
    ]
    context = "\n".join(part for part in (profile.headline or "", profile.judgement or "", *evidence) if part)
    hidden = hides_names(user)
    if hidden:
        context = scrub(context, profile.name or "", "This person")
        if profile.source == "github":
            context = scrub(context, profile.external_id, "This person")

    draft = await hr_agent.draft_email(
        {"name": profile.name, "predicted_role": title, "skills": []}, "outreach", context,
        anonymize=hidden, sender={"name": user.name, "company": user.company},
    )
    first = (profile.name or "").split()[:1]
    if hidden and draft.get("body") and first:
        draft["body"] = re.sub(r"^Hi there\b", f"Hi {first[0]}", draft["body"], count=1)
    if not draft.get("body"):
        # No language model configured: a plain note is still better than nothing.
        first = (profile.name or "there").split()[0]
        draft = {
            "subject": f"{title}: would you be open to a conversation?",
            "body": (
                f"Hi {first},\n\nI came across your work and thought of a {title} role we're hiring for. "
                "Would you be open to a short conversation? No pressure if the timing isn't right.\n\n[Your Name]"
            ),
        }
    return {**draft, "to": profile.email or "", "profile_url": profile.url or ""}

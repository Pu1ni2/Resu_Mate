"""
Candidate sourcer API
Streams a sourcing run (find people, write a judgement on every one) and keeps
its results for the manager who ran it.
"""
import asyncio
import json
from typing import Dict, Literal, Tuple
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.hr_agent import hr_agent
from app.agents.sourcer_agent import sourcer_agent
from app.core.database import async_session, get_db
from app.models.sourcing import SourcingRun, SourcedProfile
from app.services import db_service
from app.services.auth import get_current_user

router = APIRouter(prefix="/sourcer", tags=["sourcer"])
limiter = Limiter(key_func=get_remote_address)

# Saves of stopped runs finish after their request is gone; holding them here
# keeps them from being garbage-collected half way.
_pending_saves: set = set()


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


# ── Persistence ───────────────────────────────────────────────────────────────

async def _save_run(manager_id: int, description: str, plan: Dict, stats: Dict,
                    people: Dict[str, Dict], results: Dict[str, Dict], status: str) -> Tuple[int, Dict[str, int]]:
    """Save a run and everyone it judged. Returns (run_id, {pid: profile_id}).

    Opens its own session: this runs as the response streams, or after the
    client has gone, when the request's session can no longer be relied on.
    """
    async with async_session() as db:
        run = SourcingRun(manager_id=manager_id, description=description, plan=plan, stats=stats, status=status)
        db.add(run)
        await db.flush()
        saved = []
        for pid, r in results.items():
            p = people.get(pid, {})
            source, _, external_id = pid.partition(":")
            profile = SourcedProfile(
                run_id=run.id, manager_id=manager_id,
                source=p.get("source") or source, external_id=p.get("external_id") or external_id,
                name=p.get("name") or "Unknown", url=p.get("url"), avatar_url=p.get("avatar_url"),
                email=p.get("email") or None, location=p.get("location"), headline=p.get("headline"),
                verdict=r["verdict"], score=r["score"], criteria=r["criteria"], judgement=r["judgement"],
                filter_match=r["filter_match"], miss_reason=r.get("miss_reason"),
            )
            db.add(profile)
            saved.append((pid, profile))
        await db.commit()
        return run.id, {pid: profile.id for pid, profile in saved}


async def _save_stopped_run(*args) -> None:
    """_save_run for a run that was stopped. Nothing awaits it, so it logs its own failure."""
    try:
        await _save_run(*args)
    except Exception as e:
        print(f"[WARN] could not save stopped sourcing run: {e}")


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

@router.post("/runs")
@limiter.limit("10/hour")
async def start_run(request: Request, req: RunRequest, user=Depends(get_current_user)):
    """Find people for a description and judge every one, streamed live.

    The body is NDJSON, one event per line (see SourcerAgent.run_stream). It is a
    POST read with fetch rather than Server-Sent Events because the browser's
    EventSource cannot send the Authorization header.
    """
    description = req.description.strip()
    if len(description) < 3:
        raise HTTPException(400, "Describe who you're looking for.")
    sources = req.sources.model_dump()
    if not any(sources.values()):
        raise HTTPException(400, "Choose at least one place to look.")
    manager_id = user.id

    async def events():
        plan: Dict = {}
        stats: Dict = {}
        people: Dict[str, Dict] = {}
        results: Dict[str, Dict] = {}
        finished = False
        try:
            async for event in sourcer_agent.run_stream(description, manager_id, sources):
                kind = event["type"]
                if kind == "plan":
                    plan = event["plan"]
                elif kind == "found":
                    people[event["person"]["pid"]] = event["person"]
                elif kind == "judged":
                    results[event["pid"]] = event
                elif kind == "stats":
                    stats = {k: v for k, v in event.items() if k != "type"}
                elif kind == "done":
                    finished = True
                    # Saved before "done" goes out, so the page has ids to act on
                    # (save, dismiss, draft) by the time the run ends.
                    run_id, profile_ids = await _save_run(
                        manager_id, description, plan, event["stats"], people, results, "complete"
                    )
                    yield json.dumps({"type": "saved", "run_id": run_id, "profile_ids": profile_ids}) + "\n"
                yield json.dumps(event, default=str) + "\n"
        finally:
            if not finished and results:
                # Stopped part way (Stop, a closed tab, an error): keep everyone
                # already judged. The save is its own task because the stream is
                # being cancelled; it finishes even though nothing awaits it.
                task = asyncio.create_task(
                    _save_stopped_run(manager_id, description, plan, stats, people, results, "stopped")
                )
                _pending_saves.add(task)
                task.add_done_callback(_pending_saves.discard)

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        # Proxies that buffer would hold every event until the run ends.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    """Draft a first message to someone a run found. A draft only: nothing is sent."""
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

    draft = await hr_agent.draft_email(
        {"name": profile.name, "predicted_role": title, "skills": []}, "outreach", context,
    )
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

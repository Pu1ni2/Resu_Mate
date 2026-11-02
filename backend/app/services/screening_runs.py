"""Saved screening runs, to be opened again after leaving or refreshing the page.

A run was kept only in the page, so opening a candidate's file, or a refresh,
meant screening again. What a run keeps is what it worked out about each
candidate: the scores, the verdict and the skills matched, with the candidate's
id and their file's fingerprint. Who they are, their name, address and summary,
is read from their record when the run is opened (ats_service.candidate_fields),
so a candidate deleted since is in no saved run, and an id given to a later
upload doesn't take another person's scores.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.screening import ScreeningRun
from app.services.ats_service import candidate_fields
from app.services.resume_rag import resume_rag

# What a run worked out about a candidate, and all of a result it keeps.
SCORED = (
    "candidate_id", "ats_score", "assessed", "skills_match", "experience_match", "role_match",
    "education_match", "matched_skills", "missing_skills", "verdict", "auto_reject", "rejection_reason",
)
# The runs kept for each manager, the newest.
KEPT_RUNS = 20


def _stats(results: list) -> dict:
    stats = {"strong_fit": 0, "good_fit": 0, "consider": 0, "no_match": 0}
    key = {"Strong Fit": "strong_fit", "Good Fit": "good_fit", "Consider": "consider"}
    for r in results:
        stats[key.get(r.get("verdict"), "no_match")] += 1
    return stats


async def save(db: AsyncSession, manager_id: int, response: dict) -> int:
    """Keep a run as /pipeline/run answered it, less who the candidates are,
    and only the manager's newest KEPT_RUNS. Returns the run's id."""
    fingerprints = {}
    for r in response.get("results") or []:
        candidate = resume_rag.get_candidate(r.get("candidate_id"), manager_id=manager_id) or {}
        fingerprints[r.get("candidate_id")] = candidate.get("file_hash")
    kept = {
        **{k: response.get(k) for k in ("total_screened", "elapsed_ms", "assessed", "excluded", "jd_requirements")},
        "results": [{**{k: r.get(k) for k in SCORED}, "file_hash": fingerprints.get(r.get("candidate_id"))}
                    for r in response.get("results") or []],
        "shortlist_ids": [r.get("candidate_id") for r in response.get("shortlist") or []],
    }
    run = ScreeningRun(manager_id=manager_id, role=response.get("role"), run=kept)
    db.add(run)
    await db.flush()
    older = (await db.execute(
        select(ScreeningRun).where(ScreeningRun.manager_id == manager_id)
        .order_by(ScreeningRun.created_at.desc(), ScreeningRun.id.desc()).offset(KEPT_RUNS)
    )).scalars().all()
    for old in older:
        await db.delete(old)
    await db.commit()
    return run.id


def opened(run: ScreeningRun, manager_id: int) -> dict:
    """The run as /pipeline/run answered it, with who each candidate is read
    from their record today; one deleted since, or whose id now belongs to
    another file, is left out."""
    kept = run.run or {}
    results = []
    for r in kept.get("results") or []:
        candidate = resume_rag.get_candidate(r.get("candidate_id"), manager_id=manager_id)
        if not candidate or candidate.get("file_hash") != r.get("file_hash"):
            continue
        results.append({**candidate_fields(candidate), **{k: r.get(k) for k in SCORED}})
    shortlisted = set(kept.get("shortlist_ids") or [])
    return {
        "run_id": run.id,
        "role": run.role,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        **{k: kept.get(k) for k in ("elapsed_ms", "assessed", "excluded", "jd_requirements")},
        "total_screened": len(results),
        "results": results,
        "shortlist": [r for r in results if r["candidate_id"] in shortlisted],
        "stats": _stats(results),
    }


def summary(run: ScreeningRun) -> dict:
    """A run in the list of runs: its role, when, and how many it screened."""
    kept = run.run or {}
    return {
        "run_id": run.id,
        "role": run.role,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "total_screened": len(kept.get("results") or []),
    }

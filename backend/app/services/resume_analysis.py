"""The AI's reading of an uploaded résumé, done by a background job.

The upload waited for it inside the request: a minute when the AI was slow,
while the browser counted down, and an AI busy for a moment left the résumé
unread for good. The job reads it with no database session held, tries again
while the AI is busy, and the candidate says how far it got
(Candidate.analysis_status: pending, done or failed).
"""
from typing import Optional

from sqlalchemy import update

from app.core import database
from app.models.candidate import Candidate
from app.services import jobs
from app.services.resume_rag import resume_rag

ANALYZE = "resume.analyze"

# What the reading gives, as the candidate keeps it: each text cut to its
# column's size, each list a list. Nothing else of the candidate's is touched.
TEXTS = {"summary": None, "predicted_role": 200, "experience_level": 50, "location": 200}
LISTS = ("skills", "education", "work_experience", "badges", "key_strengths")


def job_key(candidate_id: int) -> str:
    return f"analyze:{candidate_id}"


async def queue(db, candidate_id: int, manager_id: Optional[int]) -> Optional[int]:
    """Queue a candidate's reading in the caller's transaction, once: one
    queued or running for them already is the one."""
    return await jobs.enqueue(db, ANALYZE, {"candidate_id": candidate_id}, dedupe_key=job_key(candidate_id),
                              manager_id=manager_id)


def kept(analysis: dict) -> dict:
    """The reading as the candidate keeps it (TEXTS, LISTS), and how many
    years of experience it found."""
    values = {}
    for field, size in TEXTS.items():
        text = analysis.get(field)
        values[field] = str(text)[:size] if size and text is not None else text
    for field in LISTS:
        value = analysis.get(field)
        values[field] = value if isinstance(value, list) else []
    values["total_experience_years"] = analysis.get("total_experience_years")
    return values


async def _analysis_failed(db, job, code) -> None:
    """The résumé couldn't be read, for good: the candidate says so, in the
    database, then in the server's memory."""
    candidate_id = job.payload["candidate_id"]
    ended = (await db.execute(update(Candidate).where(
        Candidate.id == candidate_id, Candidate.analysis_status == "pending",
    ).values(analysis_status="failed", analysis_failed=True))).rowcount == 1
    if ended:
        resume_rag.take_analysis(candidate_id, job.manager_id, {"analysis_status": "failed",
                                                                "analysis_failed": True})


@jobs.handler(ANALYZE, concurrency=2, backoff=(30, 600), on_failure=_analysis_failed)
async def analyze_resume(payload: dict) -> None:
    """Read a candidate's résumé: the AI busy or out of reach is tried again
    later, and a résumé it can't read leaves the candidate's analysis
    "failed".

    No database session is held while the AI reads. The reading is kept only
    while the candidate is still waiting for it, in the database first, then
    in the server's memory: one deleted meanwhile is left as it is.
    """
    candidate_id = payload["candidate_id"]
    async with database.async_session() as db:
        row = await db.get(Candidate, candidate_id)
        if row is None or row.analysis_status != "pending":
            return
        text, manager_id = row.full_text or row.raw_text or "", row.manager_id
    values = kept(await resume_rag.analyze(text))
    async with database.async_session() as db:
        ended = (await db.execute(update(Candidate).where(
            Candidate.id == candidate_id, Candidate.analysis_status == "pending",
        ).values(**values, analysis_status="done", analysis_failed=False))).rowcount == 1
        await db.commit()
    if ended:
        resume_rag.take_analysis(candidate_id, manager_id, {**values, "analysis_status": "done",
                                                            "analysis_failed": False})

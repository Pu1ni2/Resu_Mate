"""Role-fit evaluations, kept to be read again, and written by a background
job (evaluation.write).

An evaluation was only sent back, so opening another person's file, or a
refresh, lost it, and reading it again meant writing another. Each written one
is kept with what it was asked: the newest KEPT_PER_CANDIDATE of each
candidate's. They go with the candidate (db_service.delete_candidates) and the
account (db_service.delete_manager).

It was written inside the request too: a minute or more, lost when the page
closed, and a failure was gone with it. Each one asked for is kept
(EvaluationRequest), and the job writes it.
"""
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import database
from app.models.candidate import Candidate
from app.models.evaluation import CandidateEvaluation, EvaluationRequest
from app.services import jobs

KEPT_PER_CANDIDATE = 5
# A pasted job description is kept to this length.
MAX_JOB_DESCRIPTION = 20_000

WRITE = "evaluation.write"

# Said when one couldn't be written, tried as often as it may be.
NOT_WRITTEN = "The evaluation couldn't be completed. Please try again."


def _cut(value, limit):
    return str(value)[:limit] if value else None


async def save(db: AsyncSession, **fields) -> CandidateEvaluation:
    """keep, and commit."""
    evaluation = await keep(db, **fields)
    await db.commit()
    return evaluation


async def keep(db: AsyncSession, *, manager_id: int, candidate_id: int, role=None, level=None,
               experience_required=None, job_description=None, anonymized=False, report: str) -> CandidateEvaluation:
    """Keep an evaluation, and only the candidate's newest KEPT_PER_CANDIDATE,
    in the caller's transaction."""
    evaluation = CandidateEvaluation(
        manager_id=manager_id, candidate_id=candidate_id,
        role=_cut(role, 200), level=_cut(level, 50), experience_required=_cut(experience_required, 50),
        job_description=_cut(job_description, MAX_JOB_DESCRIPTION), anonymized=bool(anonymized), report=report,
    )
    db.add(evaluation)
    await db.flush()
    older = (await db.execute(
        select(CandidateEvaluation)
        .where(CandidateEvaluation.manager_id == manager_id, CandidateEvaluation.candidate_id == candidate_id)
        .order_by(CandidateEvaluation.created_at.desc(), CandidateEvaluation.id.desc())
        .offset(KEPT_PER_CANDIDATE)
    )).scalars().all()
    for old in older:
        await db.delete(old)
    return evaluation


def shown(evaluation: CandidateEvaluation) -> dict:
    """An evaluation as the candidate file reads it."""
    return {
        "evaluation_id": evaluation.id,
        "role": evaluation.role,
        "level": evaluation.level,
        "experience_required": evaluation.experience_required,
        "job_description": evaluation.job_description,
        "anonymized": bool(evaluation.anonymized),
        "report": evaluation.report,
        "created_at": evaluation.created_at.isoformat() if evaluation.created_at else None,
    }


async def of_candidate(db: AsyncSession, manager_id: int, candidate_id: int) -> list:
    """This manager's kept evaluations of one candidate, newest first."""
    rows = (await db.execute(
        select(CandidateEvaluation)
        .where(CandidateEvaluation.manager_id == manager_id, CandidateEvaluation.candidate_id == candidate_id)
        .order_by(CandidateEvaluation.created_at.desc(), CandidateEvaluation.id.desc())
    )).scalars().all()
    return [shown(e) for e in rows]


# ── one asked for, written by the background job ─────────────────────────────

class NotWritten(ConnectionError):
    """No step of the HR agent wrote the evaluation: the AI or the web
    search busy or out of reach, most often, so it's tried again."""


async def ask(db: AsyncSession, *, manager_id: int, candidate_id: int, role=None, level=None,
              experience_required=None, job_description=None, anonymized=False) -> EvaluationRequest:
    """Keep an evaluation asked for, with the job that writes it, in one
    commit, and return it."""
    request = EvaluationRequest(
        manager_id=manager_id, candidate_id=candidate_id,
        role=_cut(role, 200), level=_cut(level, 50), experience_required=_cut(experience_required, 50),
        job_description=_cut(job_description, MAX_JOB_DESCRIPTION), anonymized=bool(anonymized),
    )
    db.add(request)
    await db.flush()
    await jobs.enqueue(db, WRITE, {"request_id": request.id}, manager_id=manager_id)
    await db.commit()
    return request


async def _not_written(db, job, code) -> None:
    """Tried as often as it may be: the request says so, for the page."""
    await db.execute(update(EvaluationRequest).where(
        EvaluationRequest.id == job.payload["request_id"], EvaluationRequest.status == "pending",
    ).values(status="failed", error=NOT_WRITTEN, finished_at=datetime.utcnow()))


@jobs.handler(WRITE, max_attempts=3, backoff=(30, 600), on_failure=_not_written)
async def write_evaluation(payload: dict) -> None:
    """Write an evaluation asked for, and keep it with its request: the
    request says it's done, and which evaluation it wrote. It waits while
    the candidate's résumé is still being read, and one the HR agent
    couldn't write is tried again.

    No database session is held while the agent searches and writes, which
    can take a minute. Only the run that ends the request keeps what it
    wrote: one gone meanwhile (its candidate deleted), or ended by another
    run at the same time, is left as it is.
    """
    from app.agents.hr_agent import hr_agent
    from app.services.resume_rag import reading, resume_rag
    request_id = payload["request_id"]
    async with database.async_session() as db:
        request = await db.get(EvaluationRequest, request_id)
        if request is None or request.status != "pending":
            return
        row = await db.get(Candidate, request.candidate_id)
        candidate = resume_rag.get_candidate(row.id, manager_id=row.manager_id) or resume_rag.record_from_row(row)
        if reading(candidate):
            raise jobs.Defer(30)
        asked = dict(manager_id=request.manager_id, candidate_id=request.candidate_id, role=request.role,
                     level=request.level, experience_required=request.experience_required,
                     job_description=request.job_description, anonymized=request.anonymized)
    result = await hr_agent.evaluate(
        candidate=candidate, role=asked["role"], level=asked["level"], experience=asked["experience_required"],
        job_description=asked["job_description"], anonymize=asked["anonymized"], ats_score=None,
    )
    if not result.get("report"):
        raise NotWritten("no evaluation was written")
    async with database.async_session() as db:
        ended = (await db.execute(update(EvaluationRequest).where(
            EvaluationRequest.id == request_id, EvaluationRequest.status == "pending",
        ).values(status="done", finished_at=datetime.utcnow()))).rowcount == 1
        if not ended:
            return
        evaluation = await keep(db, **asked, report=result["report"])
        await db.execute(update(EvaluationRequest).where(EvaluationRequest.id == request_id)
                         .values(evaluation_id=evaluation.id))
        await db.commit()

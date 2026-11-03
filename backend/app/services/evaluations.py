"""Role-fit evaluations, kept to be read again.

An evaluation was only sent back, so opening another person's file, or a
refresh, lost it, and reading it again meant writing another. Each written one
is kept with what it was asked: the newest KEPT_PER_CANDIDATE of each
candidate's. They go with the candidate (db_service.delete_candidates) and the
account (db_service.delete_manager).
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation import CandidateEvaluation

KEPT_PER_CANDIDATE = 5
# A pasted job description is kept to this length.
MAX_JOB_DESCRIPTION = 20_000


def _cut(value, limit):
    return str(value)[:limit] if value else None


async def save(db: AsyncSession, *, manager_id: int, candidate_id: int, role=None, level=None,
               experience_required=None, job_description=None, anonymized=False, report: str) -> CandidateEvaluation:
    """Keep an evaluation, and only the candidate's newest KEPT_PER_CANDIDATE. Commits."""
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
    await db.commit()
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

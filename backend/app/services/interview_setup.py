"""Creating an interview: one way, for every place that creates one.

The candidate file's create-interview (app/api/chat.py) granted portal access,
saved the interview, then made questions for this candidate and role and kept
them, with what in the résumé to check. Screening's batch invite
(app/api/pipeline.py), which Jarvis's batch uses too, did only the first two:
its interviews asked five generic questions whatever number was chosen, and
the video room had none to ask.

The access and the interview are added together (add_interview), and the
questions are made apart (make_questions, then keep_questions), so a
background job can write them with no database session held.
"""
import logging
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import insert
from sqlalchemy.dialects import postgresql, sqlite

from app.agents.technical_agent import clean_questions, technical_agent
from app.models.candidate import CandidateAccess, Interview
from app.services.resume_rag import is_sample

logger = logging.getLogger("resumate.interview_setup")

# Why the sample résumé gets no interview. It was invitable like anyone, to
# the made-up address on it.
SAMPLE_NOT_INVITED = "The sample résumé is for trying ResuMate, so it can't be invited to an interview."


async def add_interview(db, *, manager_id, candidate_id, email, name, role, level, num_questions,
                        focus_areas, mode, experience_required=None) -> Interview:
    """The candidate's portal access and their interview, added to the
    caller's transaction (flushed, not committed): saved together, or
    neither. The access was committed on its own, and stayed when the
    interview then couldn't be saved. A grant this manager already gave the
    address is kept, though two are added at once."""
    email = email.strip().lower()
    grant = dict(email=email, name=name or "", candidate_id=candidate_id, manager_id=manager_id,
                 granted_at=datetime.utcnow())
    table = CandidateAccess.__table__
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        statement = postgresql.insert(table).values(**grant).on_conflict_do_nothing(constraint="uq_access_email_manager")
    elif dialect == "sqlite":
        statement = sqlite.insert(table).values(**grant).on_conflict_do_nothing(index_elements=["email", "manager_id"])
    else:
        statement = insert(table).values(**grant)
    await db.execute(statement)
    interview = Interview(
        candidate_id=candidate_id,
        manager_id=manager_id,
        candidate_email=email,
        role=role or "General",
        level=level or "Mid-Level",
        experience_required=experience_required,
        num_questions=num_questions,
        focus_areas=focus_areas or [],
        status="pending",
        mode=mode,
    )
    db.add(interview)
    await db.flush()
    return interview


async def make_questions(role, level, num_questions, focus_areas, name, candidate):
    """This candidate's questions for the role, and what in their résumé to
    check (technical_agent), with no database session held: the AI takes a
    while. ([], None) when they couldn't be made: the interview stands, and
    the interviewer asks its own."""
    try:
        generated = await technical_agent.generate_smart_questions(
            role, level, num_questions, focus_areas or [], name, candidate,
        )
    except Exception as e:
        logger.warning("interview questions could not be generated: %s", type(e).__name__)
        return [], None
    return clean_questions(generated.get("questions"))[:num_questions], generated.get("resume_intelligence")


def keep_questions(interview, questions, resume_intel) -> bool:
    """The questions, kept on the interview: the voice interview reads
    interview.questions and the video room room_config's résumé checks.
    Whether anything was kept; nothing is committed."""
    kept = False
    if questions:
        interview.questions = questions
        kept = True
    if isinstance(resume_intel, dict) and not resume_intel.get("analysis_failed"):
        interview.room_config = {**(interview.room_config or {}), "resume_intelligence": resume_intel}
        kept = True
    return kept


async def create_interview(db, *, manager_id, candidate, candidate_id, email, name, role, level,
                           num_questions, focus_areas, mode, experience_required=None):
    """Grant portal access, save the interview, and make its questions.

    Returns (interview, résumé analysis); the interview is None when it
    couldn't be saved, and then neither is the access. The questions are
    best effort: without them the interview stands, and the interviewer
    asks its own.

    Refuses the sample résumé (400). A batch skips it before getting here.
    """
    if is_sample(candidate):
        raise HTTPException(400, SAMPLE_NOT_INVITED)
    try:
        interview = await add_interview(
            db, manager_id=manager_id, candidate_id=candidate_id, email=email, name=name, role=role,
            level=level, num_questions=num_questions, focus_areas=focus_areas, mode=mode,
            experience_required=experience_required,
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.warning("interview could not be saved: %s", type(e).__name__)
        return None, None

    questions, resume_intel = await make_questions(
        interview.role, interview.level, num_questions, focus_areas,
        name or candidate.get("name") or "the candidate", candidate,
    )
    if keep_questions(interview, questions, resume_intel):
        try:
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.warning("interview questions could not be kept: %s", type(e).__name__)
    return interview, resume_intel

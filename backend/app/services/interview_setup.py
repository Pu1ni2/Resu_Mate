"""Creating an interview: one way, for every place that creates one.

The candidate file's create-interview (app/api/chat.py) granted portal access,
saved the interview, then made questions for this candidate and role and kept
them, with what in the résumé to check. Screening's batch invite
(app/api/pipeline.py), which Jarvis's batch uses too, did only the first two:
its interviews asked five generic questions whatever number was chosen, and
the video room had none to ask.
"""
import logging

from fastapi import HTTPException

from app.agents.technical_agent import clean_questions, technical_agent
from app.services import db_service
from app.services.resume_rag import is_sample

logger = logging.getLogger("resumate.interview_setup")

# Why the sample résumé gets no interview. It was invitable like anyone, to
# the made-up address on it.
SAMPLE_NOT_INVITED = "The sample résumé is for trying ResuMate, so it can't be invited to an interview."


async def create_interview(db, *, manager_id, candidate, candidate_id, email, name, role, level,
                           num_questions, focus_areas, mode, experience_required=None):
    """Grant portal access, save the interview, and make its questions.

    Returns (interview, résumé analysis); the interview is None when it
    couldn't be saved. The questions are best effort: without them the
    interview stands, and the interviewer asks its own.

    Refuses the sample résumé (400). A batch skips it before getting here.
    """
    if is_sample(candidate):
        raise HTTPException(400, SAMPLE_NOT_INVITED)
    await db_service.create_candidate_access(db, email, name or "", candidate_id, manager_id=manager_id)
    interview = await db_service.create_interview(db, {
        "candidate_id": candidate_id,
        "manager_id": manager_id,
        "candidate_email": email,
        "role": role or "General",
        "level": level or "Mid-Level",
        "experience_required": experience_required,
        "num_questions": num_questions,
        "focus_areas": focus_areas or [],
        "mode": mode,
    })
    if interview is None:
        return None, None

    # The questions, kept on the interview: the voice interview reads
    # interview.questions and the video room room_config's résumé checks.
    resume_intel = None
    try:
        generated = await technical_agent.generate_smart_questions(
            interview.role, interview.level, num_questions, focus_areas or [],
            name or candidate.get("name") or "the candidate", candidate,
        )
        resume_intel = generated.get("resume_intelligence")
        questions = clean_questions(generated.get("questions"))[:num_questions]
        if questions:
            interview.questions = questions
        if isinstance(resume_intel, dict) and not resume_intel.get("analysis_failed"):
            interview.room_config = {**(interview.room_config or {}), "resume_intelligence": resume_intel}
        await db.commit()
    except Exception as e:
        logger.warning("interview questions could not be generated: %s", type(e).__name__)
    return interview, resume_intel

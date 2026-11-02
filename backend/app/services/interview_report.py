"""The report on a finished interview, the same for voice and video.

A voice interview's finalize (app/api/realtime.py) and a video interview's
save-transcript (app/api/chat.py) each wrote their own. Both read only the
first 8,000 characters of the transcript, called it a recording, and asked
the AI for a verdict however little had been captured: from a few stray words
and none of the questions, one report recommended "Pass".
"""
import logging

from app.tools.openai_tool import openai_tool

logger = logging.getLogger("resumate.interview_report")

# Fewer of the candidate's words than this, or none of the interviewer's, is
# too little to judge anyone on.
MIN_CANDIDATE_WORDS = 40

# Far beyond any real interview (an hour of talk is about 60,000 characters);
# it only keeps a padded transcript from running up the cost.
MAX_TRANSCRIPT_CHARS = 120_000

NOT_ENOUGH = (
    "## Not enough to assess\n\n"
    "Not enough of the interview was captured to assess it, so there is no "
    "recommendation."
)


def _turns(transcript):
    return [t for t in (transcript or []) if isinstance(t, dict)]


def captured_enough(transcript) -> bool:
    """Whether the transcript has the interviewer's questions and enough of the candidate."""
    turns = _turns(transcript)
    asked = any(t.get("role") == "interviewer" and str(t.get("text") or "").strip() for t in turns)
    words = sum(len(str(t.get("text") or "").split()) for t in turns if t.get("role") == "candidate")
    return asked and words >= MIN_CANDIDATE_WORDS


async def write_report(transcript, role) -> str:
    """The report's markdown: the AI's, from the whole transcript, or NOT_ENOUGH.

    Raises when the AI can't be reached; the caller decides what that means
    for the interview.
    """
    if not captured_enough(transcript):
        return NOT_ENOUGH
    text = "\n".join(f"[{t.get('role', '?')}] {t.get('text', '')}" for t in _turns(transcript))
    prompt = (
        f"You're reviewing the transcript of an interview for the {role or 'open'} role. "
        "Produce a short hiring report in markdown:\n\n"
        "## Interview Summary (2-3 sentences)\n"
        "## Strengths (2-3 bullets, evidence-backed)\n"
        "## Concerns (2-3 bullets, kind tone)\n"
        "## Recommendation (Strong Hire / Hire / Consider / Pass)\n\n"
        f"Transcript:\n{text[:MAX_TRANSCRIPT_CHARS]}"
    )
    return await openai_tool.structured_call(
        prompt=prompt,
        system="You are a senior hiring manager. Be concise, fair, and evidence-grounded.",
    )


async def finish_abandoned(manager_id: int) -> int:
    """Finish a manager's interviews that were started and left, each on what
    was said (db_service.abandoned_interviews): they stayed "in progress" or
    "interrupted" for good, with no report. Run after a response, in a
    session of its own. Returns how many it finished."""
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        left = await db_service.abandoned_interviews(db, manager_id)
        for interview in left:
            try:
                report = await write_report(interview.transcript or [], interview.role)
                db_service.merge_interview_report(interview, {"report": report})
            except Exception as exc:
                logger.warning("a left interview's report failed: %s", type(exc).__name__)
            db_service.finish_interview(interview)
        await db.commit()
        return len(left)

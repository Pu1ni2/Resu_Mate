"""The report on a finished interview, the same for voice and video.

A voice interview's finalize (app/api/realtime.py) and a video interview's
save-transcript (app/api/chat.py) each wrote their own. Both read only the
first 8,000 characters of the transcript, called it a recording, and asked
the AI for a verdict however little had been captured: from a few stray words
and none of the questions, one report recommended "Pass".
"""
import logging

from app.services import jobs
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


async def _report_failed(db, job, code) -> None:
    """The report couldn't be written, for good: the interview says so, and
    why, as a short code; its manager can have it written again."""
    from sqlalchemy import update
    from app.models.candidate import Interview
    await db.execute(update(Interview).where(
        Interview.id == job.payload["interview_id"], Interview.report_status == "pending",
    ).values(report_status="failed", report_error=code))


@jobs.handler("report.write", backoff=(30, 600), on_failure=_report_failed)
async def write_interview_report(payload: dict) -> None:
    """Write a finished interview's report (db_service.complete_interview
    queues this). The AI busy or out of reach is tried again later; a
    report it can't write leaves the interview's report_status "failed".

    No database session is held while the AI writes, which can take a
    minute. The interview is read again before its report is kept: one
    deleted meanwhile, or already written, is left as it is.
    """
    from app.core import database
    from app.models.candidate import Interview
    from app.services import db_service
    interview_id = payload["interview_id"]
    async with database.async_session() as db:
        interview = await db.get(Interview, interview_id)
        if interview is None or interview.report_status != "pending":
            return
        transcript, role = interview.transcript or [], interview.role
    report = await write_report(transcript, role)
    if not report:
        raise jobs.PermanentError("report_empty")  # no AI key, or nothing came back
    async with database.async_session() as db:
        interview = await db.get(Interview, interview_id)
        if interview is None or interview.report_status != "pending":
            return
        db_service.merge_interview_report(interview, {"report": report})
        interview.report_status, interview.report_error = "done", None
        await db.commit()


async def finish_abandoned() -> int:
    """Finish every interview that was started and left, each on what was
    said (db_service.abandoned_interviews): they stayed "in progress" or
    "interrupted" for good, with no report. Returns how many it finished.

    No database session is held while a report is written, which can take
    the AI a minute. Each interview is looked at again before it's finished:
    its candidate may have come back to it meanwhile.
    """
    from app.core import database
    from app.models.candidate import Interview
    from app.services import db_service
    async with database.async_session() as db:
        left = [(iv.id, iv.transcript or [], iv.role) for iv in await db_service.abandoned_interviews(db)]
    finished = 0
    for interview_id, transcript, role in left:
        try:
            report = await write_report(transcript, role)
        except Exception as exc:
            logger.warning("a left interview's report failed: %s", type(exc).__name__)
            report = None
        async with database.async_session() as db:
            interview = await db.get(Interview, interview_id)
            if interview is None or not db_service.is_abandoned(interview):
                continue
            if report is not None:
                db_service.merge_interview_report(interview, {"report": report})
            db_service.finish_interview(interview)
            await db.commit()
            finished += 1
    return finished

"""What each kind of email says, and to whom, made as the outbox's job sends
it (app/services/outbox.py): each composer reads what it needs then, so the
outbox holds no address, code or link it doesn't have to.

main.py imports this module, which registers them.
"""
from html import escape

from app.models.auth import HiringManager
from app.models.candidate import Interview
from app.services import outbox


async def queue_interview_done(db, interview) -> None:
    """Tell an interview's manager it has finished, once: queued in the
    transaction that finishes it, so a request that loses the race to
    finish it queues nothing. It was sent inside the request, after the
    commit, with the candidate's browser or the interview worker waiting."""
    if interview.manager_id:
        await outbox.queue(db, "interview_done", manager_id=interview.manager_id, interview_id=interview.id,
                           dedupe_key=f"done:{interview.id}")


@outbox.composer("interview_done")
async def interview_done(db, email):
    """To the manager: who finished which interview. Not to an address they
    haven't confirmed is theirs."""
    interview = await db.get(Interview, email.interview_id) if email.interview_id else None
    manager = await db.get(HiringManager, email.manager_id) if email.manager_id else None
    if interview is None or manager is None or not manager.email or not manager.email_verified:
        return None
    subject = f"Interview completed — {interview.candidate_email}"
    body = (
        f"<p>Hi {escape(manager.name or 'there')},</p>"
        f"<p><strong>{escape(interview.candidate_email or '')}</strong> just completed their "
        f"{escape(interview.role or 'interview')}.</p>"
        f"<p>Log in to ResuMate to review the report.</p>"
    )
    return manager.email, subject, body

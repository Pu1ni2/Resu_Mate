"""What each kind of email says, and to whom, made as the outbox's job sends
it (app/services/outbox.py): each composer reads what it needs then, so the
outbox holds no address, code or link it doesn't have to.

The API modules that queue these emails import this one, which registers
them.
"""
from html import escape

from sqlalchemy import select

from app.core.config import settings
from app.models.auth import HiringManager
from app.models.candidate import CandidateAccess, Interview
from app.services import outbox
from app.services.auth import create_reset_token, create_verify_token
from app.services.codes import issue_code
from app.services.email_service import (
    erasure_code_email, password_reset_email, sign_in_code_email, verification_email,
)
from app.services.erasure import holds_data


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


# ── a manager's own address ──────────────────────────────────────────────────

def verify_link(manager) -> str:
    """The page that confirms the manager's address, with a token for it."""
    return f"{settings.frontend_url.rstrip('/')}/hiring/verify-email?token={create_verify_token(manager)}"


def reset_link(manager) -> str:
    """The page to choose a new password, with a token for it."""
    return f"{settings.frontend_url.rstrip('/')}/hiring/reset?token={create_reset_token(manager)}"


@outbox.composer("verify_email")
async def verify_email(db, email):
    """The link that confirms a manager's address, made as it's sent; nothing
    once the address is confirmed, an earlier link opened meanwhile."""
    manager = await db.get(HiringManager, email.manager_id) if email.manager_id else None
    if manager is None or not manager.is_active or manager.email_verified:
        return None
    return (manager.email, *verification_email(verify_link(manager)))


@outbox.composer("password_reset")
async def password_reset(db, email):
    """A link to choose a new password, for the address typed in, made as
    it's sent; nothing when no account has that address, which the one who
    asked isn't told."""
    # Typed in, as forgot-password tidied it.
    manager = (await db.execute(select(HiringManager).where(HiringManager.email == email.to_address))).scalar_one_or_none()
    if manager is None or not manager.is_active:
        return None
    return (manager.email, *password_reset_email(reset_link(manager)))


# ── codes, for whoever asks ──────────────────────────────────────────────────

@outbox.composer("sign_in_code")
async def sign_in_code(db, email):
    """A sign-in code for the address typed in, issued as it's sent: stored
    hashed, and the address's earlier codes stop working. Nothing when no
    manager has invited the address, which the one who asked isn't told."""
    access = (await db.execute(select(CandidateAccess).where(CandidateAccess.email == email.to_address))).scalars().first()
    if access is None:
        return None
    return (email.to_address, *sign_in_code_email(await issue_code(db, email.to_address)))


@outbox.composer("erasure_code")
async def erasure_code(db, email):
    """A code that confirms deleting what's held about the address typed in,
    issued as it's sent. Nothing when nothing is held, which the one who
    asked isn't told."""
    if not await holds_data(db, email.to_address):
        return None
    return (email.to_address, *erasure_code_email(await issue_code(db, email.to_address)))

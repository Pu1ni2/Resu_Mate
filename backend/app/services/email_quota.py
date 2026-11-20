"""Whether a manager may email a candidate now, and how many a day.

Any account could send as many as it liked, from ResuMate's address, to any
address it typed in: once sign-up is open, a way to send spam. A manager
sends once their own address is confirmed (the link sign-up emails), and the
last 24 hours' emails to candidates are counted before another goes.

An email to a candidate counts from the moment it's queued to send
(app/models/email_outbox.py): counted only once it had gone, two tabs could
both pass the limit. One sent before the outbox was recorded in the audit log
("email.sent"), and counts as well.
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.auth import HiringManager
from app.models.candidate import AuditLog
from app.models.email_outbox import EmailOutbox

SENT = "email.sent"

# An email in these counts: waiting, about to go, or gone. One that failed,
# or was skipped or cancelled, never went.
COUNTED = ("held", "queued", "sent")

NOT_CONFIRMED = ("Confirm your email address first, with the link we sent when you signed up. "
                 "Until then, share the portal link.")


def limit_reached() -> str:
    return (f"You've sent the {settings.daily_email_limit} emails a day allows. More can go out tomorrow; "
            "share the portal link meanwhile.")


async def sent_today(db: AsyncSession, manager_id: int) -> int:
    """Emails this manager sent, or queued to send, to candidates in the last
    24 hours."""
    since = datetime.utcnow() - timedelta(hours=24)
    queued = (await db.execute(
        select(func.count()).select_from(EmailOutbox)
        .where(EmailOutbox.manager_id == manager_id, EmailOutbox.counts_to_quota.is_(True),
               EmailOutbox.status.in_(COUNTED), EmailOutbox.created_at >= since)
    )).scalar() or 0
    logged = (await db.execute(
        select(func.count()).select_from(AuditLog)
        .where(AuditLog.manager_id == manager_id, AuditLog.action == SENT, AuditLog.created_at >= since)
    )).scalar() or 0
    return queued + logged


async def can_send(db: AsyncSession, manager_id: int) -> bool:
    return await sent_today(db, manager_id) < settings.daily_email_limit


async def reserve(db: AsyncSession, manager) -> Optional[str]:
    """Hold one of the manager's places for the day, for an email the caller
    queues in this same transaction, counting toward the limit; or say why
    there's none: their address isn't confirmed yet, or they've sent the
    day's emails.

    Two at once can't both take the last place: this writes the manager's
    row before counting, so a second reservation waits until this
    transaction ends, then counts the email it queued.
    """
    if not manager.email_verified:
        return NOT_CONFIRMED
    await db.execute(update(HiringManager).where(HiringManager.id == manager.id)
                     .values(updated_at=HiringManager.updated_at))
    if not await can_send(db, manager.id):
        return limit_reached()
    return None

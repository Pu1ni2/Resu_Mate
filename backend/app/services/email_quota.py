"""Whether a manager may email a candidate now, and how many a day.

Any account could send as many as it liked, from ResuMate's address, to any
address it typed in: once sign-up is open, a way to send spam. A manager
sends once their own address is confirmed (the link sign-up emails), and
each email sent to a candidate is recorded in the audit log ("email.sent"):
the last 24 hours' are counted before another goes.
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.candidate import AuditLog
from app.services import db_service

SENT = "email.sent"

NOT_CONFIRMED = ("Confirm your email address first, with the link we sent when you signed up. "
                 "Until then, share the portal link.")


def limit_reached() -> str:
    return (f"You've sent the {settings.daily_email_limit} emails a day allows. More can go out tomorrow; "
            "share the portal link meanwhile.")


async def sent_today(db: AsyncSession, manager_id: int) -> int:
    """Emails this manager sent to candidates in the last 24 hours."""
    since = datetime.utcnow() - timedelta(hours=24)
    return (await db.execute(
        select(func.count()).select_from(AuditLog)
        .where(AuditLog.manager_id == manager_id, AuditLog.action == SENT, AuditLog.created_at >= since)
    )).scalar() or 0


async def can_send(db: AsyncSession, manager_id: int) -> bool:
    return await sent_today(db, manager_id) < settings.daily_email_limit


async def refusal(db: AsyncSession, manager) -> Optional[str]:
    """Why this manager can't email a candidate now, or None when they can:
    their address isn't confirmed yet, or they've sent the day's emails."""
    if not manager.email_verified:
        return NOT_CONFIRMED
    if not await can_send(db, manager.id):
        return limit_reached()
    return None


async def record_sent(db: AsyncSession, manager_id: int, to_email: str, kind: str) -> None:
    """Count one email sent. Commits, as the audit log does."""
    await db_service.log_event(db, SENT, actor="manager", manager_id=manager_id, target_email=to_email, detail=kind)

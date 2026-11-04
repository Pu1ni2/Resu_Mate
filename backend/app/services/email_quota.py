"""How many emails a manager may send to candidates in a day.

Any account could send as many as it liked, from ResuMate's address, to any
address it typed in: once sign-up is open, a way to send spam. Each email
sent to a candidate is recorded in the audit log ("email.sent"), and the
last 24 hours' are counted before another goes.
"""
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.candidate import AuditLog
from app.services import db_service

SENT = "email.sent"


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


async def record_sent(db: AsyncSession, manager_id: int, to_email: str, kind: str) -> None:
    """Count one email sent. Commits, as the audit log does."""
    await db_service.log_event(db, SENT, actor="manager", manager_id=manager_id, target_email=to_email, detail=kind)

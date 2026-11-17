"""Clean-up on a schedule: the app keeps things only as long as it needs them.

Each task is a periodic kind of background job (app/services/jobs.py): one
run at a time, even with several server processes, and each run queues the
next as it ends. main.py imports this module, which registers them.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, or_

from app.core.config import settings
from app.models.auth import OTPCode
from app.models.job import Job
from app.services import jobs

logger = logging.getLogger("resumate.cleanup")

# How long past its time an expired code is kept: a sign-in reads a code,
# then marks it used, and a code deleted in between failed that sign-in.
# A code works for 15 minutes (codes.CODE_MINUTES).
EXPIRED_CODE_KEPT = timedelta(hours=1)


@jobs.handler("cleanup.sign_in_codes", every=timedelta(hours=1))
async def forget_spent_codes(payload: dict) -> None:
    """Delete the one-time codes no one can use any more (app/services/codes.py):
    used, or past their time. They were never deleted, and each holds the
    address it was sent to."""
    from app.core.database import async_session
    async with async_session() as db:
        gone = await db.execute(delete(OTPCode).where(or_(
            OTPCode.used.is_(True), OTPCode.expires_at < datetime.utcnow() - EXPIRED_CODE_KEPT,
        )))
        await db.commit()
    logger.info("cleanup: %s spent sign-in codes deleted", gone.rowcount)


@jobs.handler("interviews.finish_abandoned", every=timedelta(minutes=15))
async def finish_abandoned_interviews(payload: dict) -> None:
    """Finish the interviews started and left for 48 hours, every manager's,
    each on what was said (interview_report.finish_abandoned). They were
    finished only when their manager opened the interviews page."""
    from app.services.interview_report import finish_abandoned
    logger.info("cleanup: %s left interviews finished", await finish_abandoned())


@jobs.handler("cleanup.old_jobs", every=timedelta(days=1))
async def forget_old_jobs(payload: dict) -> None:
    """Delete the jobs that ended more than JOBS_KEEP_DAYS ago. Each report,
    email and search adds one, and the table kept them all."""
    from app.core.database import async_session
    cutoff = datetime.utcnow() - timedelta(days=settings.jobs_keep_days)
    async with async_session() as db:
        gone = await db.execute(
            delete(Job).where(Job.status.in_(("done", "failed", "cancelled")), Job.finished_at < cutoff)
        )
        await db.commit()
    logger.info("cleanup: %s old jobs deleted", gone.rowcount)

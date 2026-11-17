"""Clean-up on a schedule: the app keeps things only as long as it needs them.

Each task is a periodic kind of background job (app/services/jobs.py): one
run at a time, even with several server processes, and each run queues the
next as it ends. main.py imports this module, which registers them.
"""
import asyncio
import logging
import os
import time
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


# An upload is read within its own request (app/api/candidates.py), then
# deleted; a file this old in the folder was left behind.
LEFT_UPLOAD_AGE = timedelta(hours=1)
UPLOADS_EVERY_SECONDS = 3600.0


def _remove_left_uploads() -> int:
    from app.api.candidates import UPLOAD_DIR
    cutoff = time.time() - LEFT_UPLOAD_AGE.total_seconds()
    removed = 0
    with os.scandir(UPLOAD_DIR) as entries:
        for entry in entries:
            if entry.name.startswith(".") or not entry.is_file() or entry.stat().st_mtime >= cutoff:
                continue
            try:
                os.remove(entry.path)
                removed += 1
            except OSError:
                pass  # still open (Windows), say: tried again at the next sweep
    return removed


async def remove_left_uploads() -> None:
    """Remove the résumé files left in the uploads folder: one an upload
    couldn't delete (on Windows, a reader still had it open: "will be
    cleaned up later", and nothing did), or whose server stopped midway.

    Each machine has its own folder, so this isn't a job any process might
    take: each server process's runner calls it, at start and hourly. The
    log has the count, never a name: the names come from people's files."""
    logger.info("cleanup: %s left upload files removed", await asyncio.to_thread(_remove_left_uploads))


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

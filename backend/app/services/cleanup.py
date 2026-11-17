"""Clean-up on a schedule: the app keeps things only as long as it needs them.

Each task is a periodic kind of background job (app/services/jobs.py): one
run at a time, even with several server processes, and each run queues the
next as it ends. main.py imports this module, which registers them.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy import delete

from app.core.config import settings
from app.models.job import Job
from app.services import jobs

logger = logging.getLogger("resumate.cleanup")


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

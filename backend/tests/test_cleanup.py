"""Clean-up on a schedule (app/services/cleanup.py): the app keeps things only
as long as it needs them.
"""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import select


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _add_job(**fields):
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        job = Job(**{"kind": "report.write", **fields})
        db.add(job)
        await db.commit()
        return job.id


async def _job_ids():
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        return set((await db.execute(select(Job.id))).scalars())


def test_the_server_registers_each_clean_up_task_on_its_schedule():
    import main  # noqa: F401  (imports the tasks, as the server does)
    from app.services import jobs
    assert jobs.handler_for("cleanup.old_jobs").every == timedelta(days=1)


# ── old jobs ──────────────────────────────────────────────────────────────────

def test_jobs_that_ended_over_two_weeks_ago_are_deleted(client):
    from app.services import cleanup
    now = datetime.utcnow()
    days_ago = lambda days: now - timedelta(days=days)  # noqa: E731
    _run(_add_job(status="done", finished_at=days_ago(15)))
    _run(_add_job(status="failed", finished_at=days_ago(15)))
    _run(_add_job(status="cancelled", finished_at=days_ago(15)))
    recent = _run(_add_job(status="done", finished_at=days_ago(13)))
    # Work not ended is kept, however long ago it was queued or started.
    waiting = _run(_add_job(status="queued", created_at=days_ago(30), run_at=days_ago(30)))
    running = _run(_add_job(status="running", created_at=days_ago(30), started_at=days_ago(30)))
    _run(cleanup.forget_old_jobs({}))
    assert _run(_job_ids()) == {recent, waiting, running}


def test_how_long_ended_jobs_are_kept_is_a_setting(client, monkeypatch):
    from app.core.config import settings
    from app.services import cleanup
    monkeypatch.setattr(settings, "jobs_keep_days", 1)
    now = datetime.utcnow()
    _run(_add_job(status="done", finished_at=now - timedelta(days=2)))
    kept = _run(_add_job(status="done", finished_at=now - timedelta(hours=12)))
    _run(cleanup.forget_old_jobs({}))
    assert _run(_job_ids()) == {kept}

"""Clean-up on a schedule (app/services/cleanup.py): the app keeps things only
as long as it needs them.
"""
import asyncio
import logging
import os
import time
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
    assert jobs.handler_for("cleanup.sign_in_codes").every == timedelta(hours=1)
    assert jobs.handler_for("interviews.finish_abandoned").every == timedelta(minutes=15)


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


# ── sign-in codes ─────────────────────────────────────────────────────────────

async def _add_code(email, **fields):
    from app.core import database
    from app.models.auth import OTPCode
    async with database.async_session() as db:
        code = OTPCode(**{"email": email, "code": "a bcrypt hash", **fields})
        db.add(code)
        await db.commit()
        return code.id


async def _code_ids():
    from app.core import database
    from app.models.auth import OTPCode
    async with database.async_session() as db:
        return set((await db.execute(select(OTPCode.id))).scalars())


def test_used_and_long_expired_sign_in_codes_are_deleted(client):
    from app.services import cleanup
    now = datetime.utcnow()
    _run(_add_code("used@x.com", used=True, expires_at=now + timedelta(minutes=10)))
    _run(_add_code("old@x.com", used=False, expires_at=now - timedelta(hours=2)))
    # Expired a moment ago: a sign-in may be reading it, so it's kept a while.
    just_expired = _run(_add_code("late@x.com", used=False, expires_at=now - timedelta(minutes=10)))
    still_open = _run(_add_code("open@x.com", used=False, expires_at=now + timedelta(minutes=10)))
    _run(cleanup.forget_spent_codes({}))
    assert _run(_code_ids()) == {just_expired, still_open}


def test_a_code_still_open_signs_in_after_the_clean_up(client):
    from app.core import database
    from app.services import cleanup, codes

    async def scenario():
        async with database.async_session() as db:
            await codes.issue_code(db, "e@x.com")
            newer = await codes.issue_code(db, "e@x.com")  # the first stops working
        await cleanup.forget_spent_codes({})
        left = await _code_ids()
        async with database.async_session() as db:
            return left, await codes.redeem_code(db, "e@x.com", newer)
    left, outcome = _run(scenario())
    assert len(left) == 1 and outcome is codes.Outcome.REDEEMED


# ── files left in the uploads folder ──────────────────────────────────────────

def _file(folder, name, hours_old):
    path = folder / name
    path.write_bytes(b"%PDF-1.4 a resume")
    stamp = time.time() - hours_old * 3600
    os.utime(path, (stamp, stamp))
    return path


def test_upload_files_left_over_an_hour_are_removed(tmp_path, monkeypatch, caplog):
    from app.api import candidates
    from app.services import cleanup
    monkeypatch.setattr(candidates, "UPLOAD_DIR", str(tmp_path))
    _file(tmp_path, "1a2b3c4d_Ada_Lovelace_CV.pdf", hours_old=2)
    _file(tmp_path, "5e6f7a8b_Grace_Hopper.pdf", hours_old=0.1)  # an upload being read
    _file(tmp_path, ".gitkeep", hours_old=500)
    (tmp_path / "a_folder").mkdir()
    with caplog.at_level(logging.INFO, logger="resumate.cleanup"):
        _run(cleanup.remove_left_uploads())
    assert sorted(path.name for path in tmp_path.iterdir()) == [".gitkeep", "5e6f7a8b_Grace_Hopper.pdf", "a_folder"]
    # The count, never a name: the names come from people's files.
    assert "1 left upload files removed" in caplog.text and "Lovelace" not in caplog.text


def test_a_file_that_cant_be_removed_yet_waits_for_the_next_sweep(tmp_path, monkeypatch):
    from app.api import candidates
    from app.services import cleanup
    monkeypatch.setattr(candidates, "UPLOAD_DIR", str(tmp_path))
    locked = _file(tmp_path, "1a2b3c4d_locked.pdf", hours_old=2)
    _file(tmp_path, "5e6f7a8b_free.pdf", hours_old=2)
    real_remove = os.remove

    def remove(path):
        if "locked" in str(path):
            raise PermissionError("in use by another process")  # what Windows says
        real_remove(path)
    monkeypatch.setattr(os, "remove", remove)
    _run(cleanup.remove_left_uploads())
    assert [path.name for path in tmp_path.iterdir()] == [locked.name]


def test_the_server_sweeps_its_own_uploads_when_it_starts(client, kinds, monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    import main
    from app.api import candidates
    from app.core.config import settings
    monkeypatch.setattr(candidates, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "jobs_runner", True)
    left = _file(tmp_path, "1a2b3c4d_cv.pdf", hours_old=2)
    with TestClient(main.app):
        deadline = time.time() + 5
        while left.exists() and time.time() < deadline:
            time.sleep(0.05)
    assert not left.exists()

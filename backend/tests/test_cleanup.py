"""Clean-up on a schedule (app/services/cleanup.py): the app keeps things only
as long as it needs them.
"""
import asyncio
import logging
import os
import time
from datetime import datetime, timedelta

from sqlalchemy import func, select


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
    assert jobs.handler_for("cleanup.retention").every == timedelta(days=1)


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


# ── retention ─────────────────────────────────────────────────────────────────

async def _candidate(manager_id, name, changed_days_ago, interview_days_ago=None, file_key=None):
    """A candidate last changed `changed_days_ago`, with portal access and,
    if given, an interview made `interview_days_ago`."""
    from app.core import database
    from app.models.candidate import Candidate, CandidateAccess, Interview
    from app.models.state import ChatHistory
    now = datetime.utcnow()
    async with database.async_session() as db:
        row = Candidate(manager_id=manager_id, name=name, email=f"{name.lower()}@x.com",
                        updated_at=now - timedelta(days=changed_days_ago), file_object_key=file_key)
        db.add(row)
        await db.flush()
        db.add(CandidateAccess(manager_id=manager_id, email=row.email, candidate_id=row.id, name=name))
        if interview_days_ago is not None:
            db.add(Interview(candidate_id=row.id, manager_id=manager_id, candidate_email=row.email, role="Dev",
                             mode="conversational", created_at=now - timedelta(days=interview_days_ago)))
        db.add(ChatHistory(session_id=f"chat-{name}", manager_id=manager_id, messages=[]))
        await db.commit()
        return row.id


async def _left(model):
    from app.core import database
    async with database.async_session() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar()


async def _candidate_ids():
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        return set((await db.execute(select(Candidate.id))).scalars())


def test_retention_is_off_until_its_days_are_chosen(client):
    from conftest import register
    from app.core.config import settings
    from app.services import cleanup
    assert settings.retention_days == 0
    _, m = register(client, "keep@co.com")
    ancient = _run(_candidate(m["id"], "Ada", changed_days_ago=3000, interview_days_ago=3000))
    _run(cleanup.apply_retention({}))
    assert _run(_candidate_ids()) == {ancient}


def test_a_candidate_untouched_for_the_retention_days_goes_with_everything_of_theirs(client, monkeypatch):
    from conftest import register
    from app.core.config import settings
    from app.models.candidate import CandidateAccess, Interview
    from app.models.state import ChatHistory
    from app.services import cleanup
    from app.services.resume_rag import resume_rag
    from app.services.storage_service import storage_service
    monkeypatch.setattr(settings, "retention_days", 180)
    files, forgotten = [], []
    monkeypatch.setattr(storage_service, "delete", lambda key: files.append(key))
    monkeypatch.setattr(resume_rag, "delete_candidate", lambda cid, manager_id=None: forgotten.append((cid, manager_id)))
    _, old_mgr = register(client, "old@co.com")
    _, new_mgr = register(client, "new@co.com")
    stale = _run(_candidate(old_mgr["id"], "Ada", 200, interview_days_ago=200, file_key=f"{old_mgr['id']}/ada.pdf"))
    changed = _run(_candidate(new_mgr["id"], "Bo", 10))
    # Uploaded long ago, but interviewed last week: current, not untouched.
    interviewed = _run(_candidate(new_mgr["id"], "Cy", 300, interview_days_ago=5))
    _run(cleanup.apply_retention({}))
    assert _run(_candidate_ids()) == {changed, interviewed}
    assert (_run(_left(Interview)), _run(_left(CandidateAccess))) == (1, 2)
    # The server's in-memory copy, the original file, and the chat that may be about them.
    assert forgotten == [(stale, old_mgr["id"])] and files == [f"{old_mgr['id']}/ada.pdf"]
    assert _run(_left(ChatHistory)) == 2  # only the old manager's went


def test_retention_takes_the_searches_results_that_found_a_stale_candidate(client, monkeypatch):
    from conftest import register
    from app.core import database
    from app.core.config import settings
    from app.models.sourcing import SourcedProfile, SourcingRun
    from app.services import cleanup
    monkeypatch.setattr(settings, "retention_days", 180)
    _, m = register(client, "retain1@co.com")
    stale = _run(_candidate(m["id"], "Ada", 200))
    current = _run(_candidate(m["id"], "Bo", 10))

    async def found(*candidate_ids):
        # A Find Candidates search that read both among the uploads.
        async with database.async_session() as db:
            run = SourcingRun(manager_id=m["id"], description="Data engineers", status="complete")
            db.add(run)
            await db.flush()
            for cid in candidate_ids:
                db.add(SourcedProfile(run_id=run.id, manager_id=m["id"], source="upload", external_id=str(cid),
                                      name="Someone", verdict="shortlist"))
            await db.commit()

    async def left():
        async with database.async_session() as db:
            return [p.external_id for p in (await db.execute(select(SourcedProfile))).scalars()]
    _run(found(stale, current))
    _run(cleanup.apply_retention({}))
    assert _run(left()) == [str(current)]


def test_a_big_first_run_goes_in_batches(client, monkeypatch):
    from conftest import register
    from app.core.config import settings
    from app.services import cleanup
    monkeypatch.setattr(settings, "retention_days", 180)
    monkeypatch.setattr(cleanup, "RETENTION_BATCH", 2)
    _, m = register(client, "many@co.com")
    for n in range(5):
        _run(_candidate(m["id"], f"Old{n}", 400))
    assert _run(cleanup.delete_untouched(datetime.utcnow() - timedelta(days=180))) == 5
    assert _run(_candidate_ids()) == set()


def test_the_dry_run_lists_whom_the_server_would_delete(client, capsys):
    import cleanup_stale
    from conftest import register
    _, m = register(client, "dry@co.com")
    stale = _run(_candidate(m["id"], "Ada", 200))
    current = _run(_candidate(m["id"], "Cy", 300, interview_days_ago=5))
    _run(cleanup_stale.run(days=180, apply=False))
    listed = capsys.readouterr().out
    assert f"id={stale} " in listed and f"id={current} " not in listed
    assert _run(_candidate_ids()) == {stale, current}

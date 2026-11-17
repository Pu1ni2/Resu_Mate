"""Background jobs: slow work, kept in the database until it's done.

Uploads, invitations, reports and searches ran inside the request that asked
for them, so closing the page or a restart lost the work.
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _add(**fields):
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        job = Job(**{"kind": "test.kind", **fields})
        db.add(job)
        await db.commit()
        return job.id


async def _jobs():
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        return list((await db.execute(select(Job).order_by(Job.id))).scalars())


# ── the table ─────────────────────────────────────────────────────────────────

def test_a_new_job_waits_its_turn_now_with_nothing_tried_yet(client):
    before = datetime.utcnow()
    _run(_add(payload={"interview_id": 7}))
    (job,) = _run(_jobs())
    assert (job.status, job.priority, job.attempts, job.max_attempts, job.cancel_requested) == \
        ("queued", 100, 0, 5, False)
    assert before - timedelta(seconds=1) <= job.run_at <= datetime.utcnow()
    assert job.payload == {"interview_id": 7} and job.locked_by is None and job.last_error is None


def test_only_one_job_at_a_time_holds_a_key(client):
    _run(_add(dedupe_key="report:7"))
    with pytest.raises(IntegrityError):
        _run(_add(dedupe_key="report:7"))
    # Jobs with no key are as many as there are.
    _run(_add())
    _run(_add())
    assert [job.dedupe_key for job in _run(_jobs())] == ["report:7", None, None]


def test_deleting_an_account_deletes_its_jobs(client):
    token, user = register(client, "jobs@co.com")
    _, other = register(client, "other@co.com")
    _run(_add(manager_id=user["id"]))
    _run(_add(manager_id=other["id"]))
    r = client.post("/api/auth/delete-account", headers=auth_headers(token), json={"password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert [job.manager_id for job in _run(_jobs())] == [other["id"]]


# ── queueing ──────────────────────────────────────────────────────────────────

async def _enqueue(then="commit", **kwargs):
    from app.core import database
    from app.services import jobs
    async with database.async_session() as db:
        job_id = await jobs.enqueue(db, **kwargs)
        await (db.commit() if then == "commit" else db.rollback())
        return job_id


def test_a_job_is_queued_with_the_requests_own_changes_or_not_at_all(client):
    _run(_enqueue("rollback", kind="report.write", payload={"interview_id": 7}))
    assert _run(_jobs()) == []
    job_id = _run(_enqueue(kind="report.write", payload={"interview_id": 7}, manager_id=None))
    (job,) = _run(_jobs())
    assert (job.id, job.kind, job.payload, job.status) == (job_id, "report.write", {"interview_id": 7}, "queued")


def test_work_already_queued_isnt_queued_twice(client):
    first = _run(_enqueue(kind="report.write", payload={"interview_id": 7}, dedupe_key="report:7"))
    again = _run(_enqueue(kind="report.write", payload={"interview_id": 7}, dedupe_key="report:7"))
    assert first is not None and again is None
    assert len(_run(_jobs())) == 1


@pytest.mark.parametrize("payload", [
    {"email": "ada@x.com"}, {"name": "Ada Lovelace"}, {"resume": "Python " * 20}, {"ids": [1, 2]},
])
def test_a_job_holds_no_ones_personal_data(client, payload):
    from app.services.jobs import UnsafePayload
    with pytest.raises(UnsafePayload) as refused:
        _run(_enqueue(kind="report.write", payload=payload))
    # The refusal names the key, never the value.
    assert str(list(payload.values())[0]) not in str(refused.value)
    assert _run(_jobs()) == []


def test_a_kind_is_a_short_dotted_name(client):
    with pytest.raises(ValueError):
        _run(_enqueue(kind="Write the report"))


def test_its_lane_is_woken_once_the_transaction_commits(client):
    from app.core import database
    from app.services import jobs
    woken = []
    jobs.on_queued("work", lambda: woken.append("work"))
    jobs.on_queued("email", lambda: woken.append("email"))

    async def queue_then_commit():
        async with database.async_session() as db:
            await jobs.enqueue(db, "report.write")
            assert woken == []  # not before the commit
            await db.commit()
    try:
        _run(_enqueue("rollback", kind="report.write"))
        assert woken == []
        _run(queue_then_commit())
        _run(_enqueue(kind="email.sign_in_code", priority=0))
        assert woken == ["work", "email"]
    finally:
        jobs.on_queued("work", None)
        jobs.on_queued("email", None)


# ── claiming ──────────────────────────────────────────────────────────────────

async def _claim(kinds=("test.kind",), limit=10, now=None, worker="host:1:abcd1234", lease_seconds=60):
    from app.core import database
    from app.services import jobs
    async with database.async_session() as db:
        return await jobs.claim(db, kinds, limit=limit, now=now or datetime.utcnow(), worker=worker,
                                lease_seconds=lease_seconds)


def test_the_most_urgent_due_jobs_are_taken_first(client):
    now = datetime.utcnow()
    later = _run(_add(priority=100, run_at=now - timedelta(minutes=1)))
    sooner = _run(_add(priority=100, run_at=now - timedelta(minutes=5)))
    code = _run(_add(priority=0, run_at=now))
    _run(_add(run_at=now + timedelta(hours=1)))  # not due yet
    _run(_add(kind="other.kind"))  # a kind this process doesn't do
    taken = _run(_claim(limit=2, now=now))
    assert [row.id for row in taken] == [code, sooner]
    assert [row.id for row in _run(_claim(limit=10, now=now))] == [later]
    assert _run(_claim(now=now)) == []


def test_a_taken_job_is_marked_running_by_its_worker_until_its_lease_ends(client):
    now = datetime.utcnow()
    job_id = _run(_add(payload={"interview_id": 7}, run_at=now))
    (row,) = _run(_claim(now=now, worker="host:42:feedbeef", lease_seconds=120))
    assert (row.id, row.kind, row.payload, row.attempts) == (job_id, "test.kind", {"interview_id": 7}, 1)
    (job,) = _run(_jobs())
    assert (job.status, job.locked_by, job.attempts) == ("running", "host:42:feedbeef", 1)
    assert job.locked_until == now + timedelta(seconds=120) and job.started_at == now


def test_a_job_whose_worker_stopped_is_taken_up_again_once_its_lease_runs_out(client):
    now = datetime.utcnow()
    _run(_add(run_at=now))
    _run(_claim(now=now, worker="host:1:gone0000", lease_seconds=60))
    # Its lease still holds: no one else takes it.
    assert _run(_claim(now=now + timedelta(seconds=59), worker="host:2:next0000")) == []
    (row,) = _run(_claim(now=now + timedelta(seconds=61), worker="host:2:next0000"))
    assert row.attempts == 2
    assert _run(_jobs())[0].locked_by == "host:2:next0000"


def test_a_job_past_its_last_attempt_fails_instead_of_running_again(client):
    now = datetime.utcnow()
    _run(_add(max_attempts=1, dedupe_key="report:7", run_at=now))
    _run(_claim(now=now, lease_seconds=60))
    assert _run(_claim(now=now + timedelta(seconds=61))) == []
    (job,) = _run(_jobs())
    assert (job.status, job.last_error, job.locked_by, job.dedupe_key) == ("failed", "lease_expired", None, None)
    assert job.finished_at == now + timedelta(seconds=61)


# ── running a job ─────────────────────────────────────────────────────────────

@pytest.fixture()
def kinds():
    """Register kinds of job for one test: kinds(kind, run, **options)."""
    from app.services import jobs
    added = []

    def register(kind, run, **options):
        jobs.handler(kind, **options)(run)
        added.append(kind)
    yield register
    for kind in added:
        jobs._handlers.pop(kind, None)


async def _run_due(kind_names, now, worker="host:1:abcd1234"):
    """Claim the due jobs of these kinds, as `worker`, and run each to its
    next state; their outcomes."""
    from app.services import jobs
    rows = await _claim(kinds=kind_names, now=now, worker=worker)
    return [await jobs.run_claimed(row, worker, now=lambda: now) for row in rows]


async def _take_over(job_id, worker):
    from app.core import database
    from app.models.job import Job
    from sqlalchemy import update
    async with database.async_session() as db:
        await db.execute(update(Job).where(Job.id == job_id).values(locked_by=worker))
        await db.commit()


def test_a_job_that_finishes_is_done_and_frees_its_key(client, kinds):
    seen = []

    async def write_report(payload):
        seen.append(payload)
    kinds("test.report", write_report)
    now = datetime.utcnow()
    _run(_enqueue(kind="test.report", payload={"interview_id": 7}, dedupe_key="report:7", run_at=now))
    assert _run(_run_due(["test.report"], now)) == ["done"]
    assert seen == [{"interview_id": 7}]
    (job,) = _run(_jobs())
    assert (job.status, job.finished_at, job.dedupe_key, job.locked_by, job.last_error) == \
        ("done", now, None, None, None)
    # The key is free again: the same work can be queued once more.
    assert _run(_enqueue(kind="test.report", dedupe_key="report:7")) is not None


def test_a_passing_failure_is_tried_again_after_a_growing_wait(client, kinds):
    async def busy(payload):
        raise TimeoutError
    kinds("test.busy", busy, backoff=(10, 600))
    now = datetime.utcnow()
    _run(_enqueue(kind="test.busy", run_at=now))
    assert _run(_run_due(["test.busy"], now)) == ["retry"]
    (job,) = _run(_jobs())
    assert (job.status, job.attempts, job.last_error, job.locked_by) == ("queued", 1, "retry:TimeoutError", None)
    assert 8 <= (job.run_at - now).total_seconds() <= 12  # 10 s, give or take a fifth
    assert _run(_run_due(["test.busy"], now)) == []  # not before its time
    then = job.run_at
    assert _run(_run_due(["test.busy"], then)) == ["retry"]
    (job,) = _run(_jobs())
    assert job.attempts == 2 and 16 <= (job.run_at - then).total_seconds() <= 24  # then 20 s


def test_a_job_fails_for_good_on_a_lasting_error_or_its_last_attempt(client, kinds):
    from app.models.job import Job
    from app.services.jobs import PermanentError
    failed = []

    async def note_failure(db, job, code):
        failed.append((job.kind, code))
        # Written in the same transaction as the failure.
        db.add(Job(kind="test.followup", payload={}))

    async def gone(payload):
        raise PermanentError("interview_gone")

    async def wrong(payload):
        raise ValueError("ada@x.com isn't a valid address")  # its text is never kept

    async def busy(payload):
        raise TimeoutError
    kinds("test.gone", gone, on_failure=note_failure)
    kinds("test.wrong", wrong, on_failure=note_failure)
    kinds("test.busy", busy, max_attempts=1, on_failure=note_failure)
    now = datetime.utcnow()
    for kind in ("test.gone", "test.wrong", "test.busy"):
        _run(_enqueue(kind=kind, run_at=now, dedupe_key=kind.replace(".", ":")))
    assert _run(_run_due(["test.gone", "test.wrong", "test.busy"], now)) == ["failed"] * 3
    assert sorted(failed) == [("test.busy", "error:TimeoutError"), ("test.gone", "interview_gone"),
                              ("test.wrong", "error:ValueError")]
    done_with = [job for job in _run(_jobs()) if job.kind != "test.followup"]
    assert len(done_with) == 3 and len(_run(_jobs())) == 6
    for job in done_with:
        assert (job.status, job.dedupe_key, job.locked_by, job.finished_at) == ("failed", None, None, now)
        assert "ada@x.com" not in job.last_error


def test_a_worker_that_lost_its_job_changes_nothing(client, kinds):
    from app.services import jobs

    async def write_report(payload):
        pass
    kinds("test.report", write_report)
    now = datetime.utcnow()
    _run(_enqueue(kind="test.report", run_at=now))
    (row,) = _run(_claim(kinds=["test.report"], now=now, worker="host:1:first000"))
    # Its lease ran out meanwhile, and another worker took the job up.
    _run(_take_over(row.id, "host:2:second00"))
    assert _run(jobs.run_claimed(row, "host:1:first000", now=lambda: now)) == "lost"
    (job,) = _run(_jobs())
    assert (job.status, job.locked_by, job.finished_at) == ("running", "host:2:second00", None)


def test_a_kind_of_job_is_registered_by_a_short_dotted_name(client):
    from app.services import jobs
    with pytest.raises(ValueError):
        jobs.handler("Write the report")

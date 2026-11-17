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


def test_a_job_past_its_last_attempt_fails_instead_of_running_again(client, kinds):
    ran = []

    async def write_report(payload):
        ran.append(payload)
    kinds("test.kind", write_report)
    now = datetime.utcnow()
    _run(_add(max_attempts=1, dedupe_key="report:7", run_at=now))
    _run(_claim(now=now, lease_seconds=60))
    # Its worker stopped during its one try, and its lease ran out.
    assert _run(_run_due(["test.kind"], now + timedelta(seconds=61))) == ["failed"]
    assert ran == []
    (job,) = _run(_jobs())
    assert (job.status, job.last_error, job.locked_by, job.dedupe_key) == ("failed", "lease_expired", None, None)
    assert job.finished_at == now + timedelta(seconds=61)


# ── running a job ─────────────────────────────────────────────────────────────
# (kinds, the fixture that registers kinds of job for a test, is in conftest.py.)

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


def test_a_job_whose_worker_stopped_during_its_last_try_fails_with_its_kinds_failure_step(client, kinds):
    from app.models.job import Job
    failed = []

    async def write_report(payload):
        pass

    async def note_failure(db, job, code):
        failed.append((job.kind, code))
        db.add(Job(kind="test.followup", payload={}))  # in the same transaction as the failure
    kinds("test.report", write_report, max_attempts=1, on_failure=note_failure)
    now = datetime.utcnow()
    _run(_enqueue(kind="test.report", run_at=now, dedupe_key="report:7"))
    _run(_claim(kinds=["test.report"], now=now, worker="host:1:gone0000"))
    # Its worker stopped during the job's one try, and the lease ran out.
    assert _run(_run_due(["test.report"], now + timedelta(seconds=61))) == ["failed"]
    assert failed == [("test.report", "lease_expired")]
    job, followup = _run(_jobs())
    assert (job.status, job.last_error, job.dedupe_key) == ("failed", "lease_expired", None)
    assert followup.kind == "test.followup"


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


# ── waiting, and time limits ──────────────────────────────────────────────────

def test_a_job_that_cant_run_yet_waits_without_using_a_try(client, kinds):
    from app.services.jobs import Defer

    async def not_yet(payload):
        raise Defer(30)
    kinds("test.wait", not_yet)
    now = datetime.utcnow()
    _run(_enqueue(kind="test.wait", run_at=now))
    assert _run(_run_due(["test.wait"], now)) == ["deferred"]
    (job,) = _run(_jobs())
    assert (job.status, job.attempts, job.run_at, job.locked_by) == ("queued", 0, now + timedelta(seconds=30), None)


def test_a_job_still_waiting_after_half_an_hour_fails(client, kinds):
    from app.services.jobs import Defer

    async def not_yet(payload):
        raise Defer(30)
    kinds("test.wait", not_yet)
    long_ago = datetime.utcnow() - timedelta(minutes=31)
    _run(_add(kind="test.wait", created_at=long_ago, run_at=long_ago))
    assert _run(_run_due(["test.wait"], datetime.utcnow())) == ["failed"]
    (job,) = _run(_jobs())
    assert (job.status, job.last_error) == ("failed", "waited_too_long")


def test_a_run_past_its_time_limit_is_stopped_and_tried_again(client, kinds):
    stopped = []

    async def stuck(payload):
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            stopped.append(True)
            raise
    kinds("test.stuck", stuck, timeout_seconds=0.05)
    now = datetime.utcnow()
    _run(_enqueue(kind="test.stuck", run_at=now))
    assert _run(_run_due(["test.stuck"], now)) == ["retry"]
    assert stopped == [True]
    (job,) = _run(_jobs())
    assert (job.status, job.last_error) == ("queued", "retry:TimeoutError")


# ── the heartbeat, and stopping a job ─────────────────────────────────────────

def test_a_long_job_keeps_its_lease_while_it_runs(client, kinds):
    from app.services import jobs
    seen = []

    async def long_report(payload):
        await asyncio.sleep(0.5)
        (job,) = await _jobs()
        seen.append(job.locked_until)
    kinds("test.long", long_report, lease_seconds=0.2)
    _run(_enqueue(kind="test.long"))
    claimed_at = datetime.utcnow()
    (row,) = _run(_claim(kinds=["test.long"], now=claimed_at, lease_seconds=0.2))
    assert _run(jobs.run_claimed(row, "host:1:abcd1234")) == "done"
    # Without the heartbeat, the lease would have run out 0.2 s after the claim.
    assert seen[0] > claimed_at + timedelta(seconds=0.3)


def test_a_run_that_ends_during_a_lease_renewal_lets_the_renewal_finish(client, kinds, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.core import database
    from app.services import jobs
    renewing, cut_off = asyncio.Event(), []

    class SlowRenewals(AsyncSession):
        async def execute(self, statement, *args, **kwargs):
            result = await super().execute(statement, *args, **kwargs)
            if "RETURNING jobs.cancel_requested" in str(statement):  # a lease renewal
                renewing.set()
                try:
                    await asyncio.sleep(0.2)  # written, not yet committed
                except asyncio.CancelledError:
                    cut_off.append(True)
                    raise
            return result

    async def report(payload):
        await renewing.wait()  # the run ends while a renewal is under way
    kinds("test.report", report, lease_seconds=0.2, timeout_seconds=5)
    _run(_enqueue(kind="test.report"))
    (row,) = _run(_claim(kinds=["test.report"], lease_seconds=0.2))
    monkeypatch.setattr(database, "async_session",
                        async_sessionmaker(database.engine, class_=SlowRenewals, expire_on_commit=False))
    assert _run(jobs.run_claimed(row, "host:1:abcd1234")) == "done"
    assert cut_off == []
    (job,) = _run(_jobs())
    assert (job.status, job.locked_by) == ("done", None)


def test_a_job_another_worker_took_up_is_stopped_here(client, kinds):
    from app.services import jobs
    stopped = []

    async def endless(payload):
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            stopped.append(True)
            raise
    kinds("test.endless", endless, lease_seconds=0.2)

    async def scenario():
        await _enqueue(kind="test.endless")
        (row,) = await _claim(kinds=["test.endless"], worker="host:1:first000", lease_seconds=0.2)
        running = asyncio.ensure_future(jobs.run_claimed(row, "host:1:first000"))
        await asyncio.sleep(0.1)
        await _take_over(row.id, "host:2:second00")
        return await asyncio.wait_for(running, timeout=5)
    assert _run(scenario()) == "lost"
    assert stopped == [True]
    (job,) = _run(_jobs())
    assert (job.status, job.locked_by) == ("running", "host:2:second00")


def test_a_running_job_asked_to_stop_stops_and_tidies_up(client, kinds):
    from app.core import database
    from app.services import jobs
    tidied = []

    async def endless(payload):
        await asyncio.sleep(30)

    async def tidy_up(db, job, code):
        tidied.append((job.kind, code))
    kinds("test.search", endless, lease_seconds=0.2, on_cancel=tidy_up)

    async def scenario():
        job_id = await _enqueue(kind="test.search", dedupe_key="search:7")
        (row,) = await _claim(kinds=["test.search"], lease_seconds=0.2)
        running = asyncio.ensure_future(jobs.run_claimed(row, "host:1:abcd1234"))
        await asyncio.sleep(0.05)
        async with database.async_session() as db:
            assert await jobs.request_cancel(db, job_id) == "running"
            await db.commit()
        return await asyncio.wait_for(running, timeout=5)
    assert _run(scenario()) == "cancelled"
    assert tidied == [("test.search", "cancelled")]
    (job,) = _run(_jobs())
    assert (job.status, job.dedupe_key, job.locked_by) == ("cancelled", None, None)


def test_a_queued_job_asked_to_stop_is_cancelled_at_once_and_never_runs(client, kinds):
    from app.core import database
    from app.models.job import Job
    from app.services import jobs
    ran, tidied = [], []

    async def search(payload):
        ran.append(payload)

    async def tidy_up(db, job, code):
        tidied.append((job.kind, job.payload, code))
        db.add(Job(kind="test.followup", payload={}))  # in the asking request's transaction
    kinds("test.search", search, on_cancel=tidy_up)

    async def ask(job_id, then="commit"):
        async with database.async_session() as db:
            status = await jobs.request_cancel(db, job_id)
            await (db.commit() if then == "commit" else db.rollback())
            return status
    job_id = _run(_enqueue(kind="test.search", payload={"run_id": 7}, dedupe_key="search:7"))
    # Nothing is committed but by the request that asks.
    _run(ask(job_id, then="rollback"))
    assert [job.status for job in _run(_jobs())] == ["queued"]
    tidied.clear()
    assert _run(ask(job_id)) == "cancelled"
    assert tidied == [("test.search", {"run_id": 7}, "cancelled")]
    job, followup = _run(_jobs())
    assert (job.status, job.dedupe_key, job.cancel_requested) == ("cancelled", None, True)
    assert followup.kind == "test.followup"
    assert _run(_run_due(["test.search"], datetime.utcnow())) == [] and ran == []
    assert _run(ask(job_id)) == "cancelled"  # asked again: as it was
    assert _run(ask(9999)) is None


@pytest.mark.parametrize("ending, outcome", [
    ("busy", "cancelled"), ("not_yet", "cancelled"), ("gone", "cancelled"), ("finished", "done"),
])
def test_a_job_asked_to_stop_while_it_runs_never_runs_again(client, kinds, ending, outcome):
    from app.core import database
    from app.services import jobs
    from app.services.jobs import Defer, PermanentError
    asked, tidied = [], []

    async def search(payload):
        # Asked to stop, then the run ends before its heartbeat notices.
        async with database.async_session() as db:
            await jobs.request_cancel(db, asked[0])
            await db.commit()
        if ending == "busy":
            raise TimeoutError  # would be tried again
        if ending == "not_yet":
            raise Defer(30)  # would wait
        if ending == "gone":
            raise PermanentError("run_gone")

    async def tidy_up(db, job, code):
        tidied.append(code)
    kinds("test.search", search, on_cancel=tidy_up)
    now = datetime.utcnow()
    asked.append(_run(_enqueue(kind="test.search", run_at=now, dedupe_key="search:7")))
    assert _run(_run_due(["test.search"], now)) == [outcome]
    (job,) = _run(_jobs())
    assert (job.status, job.dedupe_key, job.locked_by) == (outcome, None, None)
    # A run that finished its work is kept as done; any other ending is the stop.
    assert tidied == ([] if outcome == "done" else ["cancelled"])


def test_a_job_asked_to_stop_after_its_worker_stopped_isnt_run(client, kinds):
    ran, tidied = [], []

    async def search(payload):
        ran.append(payload)

    async def tidy_up(db, job, code):
        tidied.append(code)
    kinds("test.search", search, on_cancel=tidy_up)
    now = datetime.utcnow()
    # Its worker stopped mid-run; then someone asked it to stop.
    _run(_add(kind="test.search", status="running", attempts=1, cancel_requested=True, run_at=now,
              locked_by="host:1:gone0000", locked_until=now - timedelta(seconds=1)))
    assert _run(_run_due(["test.search"], now)) == ["cancelled"]
    assert ran == [] and tidied == ["cancelled"]
    (job,) = _run(_jobs())
    assert (job.status, job.locked_by) == ("cancelled", None)


def test_a_job_asked_to_stop_during_its_last_try_ends_cancelled_not_failed(client, kinds):
    tidied, failed = [], []

    async def search(payload):
        pass

    async def tidy_up(db, job, code):
        tidied.append(code)

    async def note_failure(db, job, code):
        failed.append(code)
    kinds("test.search", search, on_cancel=tidy_up, on_failure=note_failure)
    now = datetime.utcnow()
    # Asked to stop during its last try; its worker stopped before noticing.
    _run(_add(kind="test.search", status="running", attempts=1, max_attempts=1, cancel_requested=True,
              run_at=now, locked_by="host:1:gone0000", locked_until=now - timedelta(seconds=1)))
    assert _run(_run_due(["test.search"], now)) == ["cancelled"]
    assert (tidied, failed) == (["cancelled"], [])

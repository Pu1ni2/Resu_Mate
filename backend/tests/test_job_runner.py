"""The job runner: background jobs run in the server's own process, as soon
as a request queues them, in lanes of a few slots each, and a shutdown puts
the ones still running back in the queue.

Each test starts a runner of its own on the test database: the server's is
off in tests (JOBS_RUNNER=false).
"""
import asyncio
from datetime import timedelta


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _start(work=2, email=2, poll=30.0):
    """A runner whose lanes look for due jobs every `poll` seconds, besides
    being woken. Started inside the test's event loop."""
    from app.services import job_runner, jobs
    return job_runner.start(work_slots=work, email_slots=email,
                            poll_seconds={jobs.EMAIL_LANE: poll, jobs.WORK_LANE: poll})


async def _queue(kind, **fields):
    """Queue a job and commit, as a request does."""
    from app.core import database
    from app.services import jobs
    async with database.async_session() as db:
        job_id = await jobs.enqueue(db, kind, **fields)
        await db.commit()
        return job_id


async def _job(job_id):
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        return await db.get(Job, job_id)


async def _until(check, seconds=5.0):
    """Wait until check() is true; fail after `seconds`."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + seconds
    while not check():
        assert loop.time() < deadline, "not within the time allowed"
        await asyncio.sleep(0.02)


async def _until_status(job_id, status, seconds=5.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + seconds
    while getattr(await _job(job_id), "status", None) != status:
        assert loop.time() < deadline, f"job {job_id} isn't {status}"
        await asyncio.sleep(0.02)


async def _jobs():
    from sqlalchemy import select
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        return list((await db.execute(select(Job).order_by(Job.id))).scalars())


def test_a_queued_job_runs_in_the_background_once_its_request_commits(client, kinds):
    ran = []

    async def write_report(payload):
        ran.append(payload)
    kinds("test.report", write_report)

    async def scenario():
        runner = _start(poll=30)  # a look every 30 s: only being woken explains a quick run
        try:
            await asyncio.sleep(0.5)  # after the lanes' first look, when they start
            job_id = await _queue("test.report", payload={"interview_id": 7})
            await _until_status(job_id, "done", seconds=3)
        finally:
            await runner.stop(grace_seconds=1)
    _run(scenario())
    assert ran == [{"interview_id": 7}]


def test_a_lane_runs_no_more_jobs_at_once_than_its_slots(client, kinds):
    started, let_go = [], asyncio.Event()

    async def slow(payload):
        started.append(payload["n"])
        await let_go.wait()
    kinds("test.slow", slow)

    async def scenario():
        runner = _start(work=2)
        try:
            ids = [await _queue("test.slow", payload={"n": n}) for n in range(3)]
            await _until(lambda: len(started) == 2)
            await asyncio.sleep(0.3)
            assert started == [0, 1] and (await _job(ids[2])).status == "queued"
            let_go.set()
            await _until_status(ids[2], "done")
        finally:
            let_go.set()
            await runner.stop(grace_seconds=1)
    _run(scenario())
    assert started == [0, 1, 2]


def test_a_kind_with_a_cap_runs_no_more_than_that_at_once(client, kinds):
    started, let_go = [], asyncio.Event()

    async def search(payload):
        started.append(("search", payload["n"]))
        await let_go.wait()

    async def report(payload):
        started.append(("report", payload["n"]))
    kinds("test.search", search, concurrency=1)
    kinds("test.report", report)

    async def scenario():
        runner = _start(work=2)
        try:
            first = await _queue("test.search", payload={"n": 0})
            second = await _queue("test.search", payload={"n": 1})
            report_id = await _queue("test.report", payload={"n": 0})
            # The second slot goes to the report, not to a second search.
            await _until_status(report_id, "done")
            await asyncio.sleep(0.3)
            assert (await _job(first)).status == "running" and (await _job(second)).status == "queued"
            let_go.set()
            await _until_status(second, "done")
        finally:
            let_go.set()
            await runner.stop(grace_seconds=1)
    _run(scenario())
    assert started == [("search", 0), ("report", 0), ("search", 1)]


def test_an_email_isnt_held_up_by_work_that_fills_its_lane(client, kinds):
    let_go = asyncio.Event()

    async def slow(payload):
        await let_go.wait()

    async def send(payload):
        pass
    kinds("test.slow", slow)
    kinds("email.test_code", send)

    async def scenario():
        runner = _start(work=1, email=1)
        try:
            work = await _queue("test.slow")
            await _until_status(work, "running")
            code = await _queue("email.test_code")
            await _until_status(code, "done", seconds=3)
            assert (await _job(work)).status == "running"
        finally:
            let_go.set()
            await runner.stop(grace_seconds=1)
    _run(scenario())


def test_a_job_is_claimed_for_at_least_its_kinds_lease(client, kinds):
    let_go = asyncio.Event()

    async def long_report(payload):
        await let_go.wait()

    async def quick(payload):
        pass
    kinds("test.long", long_report, lease_seconds=600)
    kinds("test.quick", quick, lease_seconds=30)

    async def scenario():
        runner = _start()
        try:
            job_id = await _queue("test.long")
            await _until_status(job_id, "running")
            return await _job(job_id)
        finally:
            let_go.set()
            await runner.stop(grace_seconds=1)
    job = _run(scenario())
    # Its first renewal comes 150 s in, a quarter of its lease: the claim's
    # lease must last that long.
    assert job.locked_until - job.started_at >= timedelta(seconds=600)


def test_stopping_lets_running_jobs_end_then_puts_the_rest_back(client, kinds):
    stopped = []

    async def quick(payload):
        await asyncio.sleep(0.1)

    async def endless(payload):
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            stopped.append(True)
            raise
    kinds("test.quick", quick)
    kinds("test.endless", endless)

    async def scenario():
        runner = _start(work=2)
        quick_id = await _queue("test.quick")
        endless_id = await _queue("test.endless")
        await _until_status(endless_id, "running")
        await runner.stop(grace_seconds=0.5)
        assert runner.running() == 0
        assert all(lane.taking.done() for lane in runner.lanes)
        return await _job(quick_id), await _job(endless_id)
    quick_job, endless_job = _run(scenario())
    assert quick_job.status == "done"
    # Back in the queue, its try not counted, for the next process to take up.
    assert (endless_job.status, endless_job.attempts, endless_job.locked_by) == ("queued", 0, None)
    assert stopped == [True]


def test_stopping_an_idle_runner_takes_no_grace(client, kinds):  # kinds: no job to run at all
    async def scenario():
        runner = _start()
        await asyncio.sleep(0.2)
        loop = asyncio.get_running_loop()
        started = loop.time()
        await runner.stop(grace_seconds=5)
        return loop.time() - started
    # Nothing was running: a deploy's shutdown waits for nothing.
    assert _run(scenario()) < 1


def test_a_lane_keeps_going_when_claiming_fails(client, kinds, monkeypatch, caplog):
    from sqlalchemy.exc import OperationalError
    from app.services import jobs
    real_claim, failed = jobs.claim, []

    async def claim_once_unreachable(db, kinds, **options):
        if not failed:
            failed.append(True)
            raise OperationalError("UPDATE jobs", {}, Exception("server at db.internal unreachable"))
        return await real_claim(db, kinds, **options)
    monkeypatch.setattr(jobs, "claim", claim_once_unreachable)
    ran = []

    async def write_report(payload):
        ran.append(payload)
    kinds("test.report", write_report)

    async def scenario():
        runner = _start(poll=0.05)
        try:
            job_id = await _queue("test.report", payload={"interview_id": 7})
            await _until_status(job_id, "done")
        finally:
            await runner.stop(grace_seconds=1)
    _run(scenario())
    assert failed == [True] and ran == [{"interview_id": 7}]
    assert "claiming failed: OperationalError" in caplog.text
    assert "db.internal" not in caplog.text  # its type and place, never its text


def test_a_schedule_starts_with_the_runner_and_keeps_going_after_a_failed_check(client, kinds, monkeypatch):
    from app.services import jobs
    real_ensure, failed, ran = jobs.ensure_schedules, [], []

    async def ensure_once_unreachable(*args, **kwargs):
        if not failed:
            failed.append(True)
            raise ConnectionError
        return await real_ensure(*args, **kwargs)
    monkeypatch.setattr(jobs, "ensure_schedules", ensure_once_unreachable)

    async def tidy(payload):
        ran.append(payload)
    kinds("test.tidy", tidy, every=timedelta(hours=1))

    async def scenario():
        from app.services import job_runner
        runner = job_runner.start(work_slots=1, email_slots=1, schedules_seconds=0.1,
                                  poll_seconds={jobs.EMAIL_LANE: 30, jobs.WORK_LANE: 30})
        try:
            await _until(lambda: ran == [{}])
            # Then its next run is queued, an hour on.
            deadline = asyncio.get_running_loop().time() + 5
            while [job.status for job in await _jobs()] != ["done", "queued"]:
                assert asyncio.get_running_loop().time() < deadline, "its next run wasn't queued"
                await asyncio.sleep(0.02)
        finally:
            await runner.stop(grace_seconds=1)
        return await _jobs()
    done, following = _run(scenario())
    assert failed == [True]
    assert (done.status, following.dedupe_key) == ("done", "cron:test.tidy")
    assert timedelta(minutes=59) < following.run_at - done.finished_at <= timedelta(hours=1)


# ── started and stopped with the server ───────────────────────────────────────

def test_the_server_runs_jobs_and_lets_a_running_one_end_on_shutdown(client, kinds, monkeypatch):
    from fastapi.testclient import TestClient
    import main
    from app.core.config import settings

    async def write_report(payload):
        await asyncio.sleep(0.5)
    kinds("test.report", write_report)
    monkeypatch.setattr(settings, "jobs_runner", True)
    monkeypatch.setattr(settings, "jobs_shutdown_grace_seconds", 5)
    # A second copy of the app, with the runner on (client's has it off).
    with TestClient(main.app):
        runner = main.app.state.job_runner
        assert [lane.name for lane in runner.lanes] == ["email", "work"]
        job_id = _run(_queue("test.report"))
        _run(_until_status(job_id, "running"))
    # The shutdown let it end, rather than cutting it off.
    assert _run(_job(job_id)).status == "done"
    assert all(lane.taking.done() for lane in runner.lanes)


def test_the_tests_app_has_no_runner_of_its_own(client):
    import main
    assert main.app.state.job_runner is None

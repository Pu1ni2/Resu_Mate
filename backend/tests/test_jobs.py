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
        job = Job(kind="test.kind", **fields)
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

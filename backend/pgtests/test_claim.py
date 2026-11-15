"""What only Postgres shows: workers claiming jobs at the same time, each job
taken by one of them (app/services/jobs.py, claim).

These run in CI's postgres job, on a database the migrations built, not in
the main suite, whose database is SQLite (tests/test_jobs.py has the rest).
"""
import asyncio
import os
from datetime import datetime, timedelta

import pytest

if not os.environ.get("DATABASE_URL", "").startswith("postgres"):
    pytest.skip("needs DATABASE_URL to be a Postgres database", allow_module_level=True)
os.environ.setdefault("RESUMATE_ENV_FILE", os.devnull)

from sqlalchemy import delete, select  # noqa: E402

from app.core import database  # noqa: E402
import app.models.auth  # noqa: E402,F401  the accounts table jobs point to
from app.models.job import Job  # noqa: E402
from app.services import jobs  # noqa: E402

KIND = "pgtest.claim"


async def _queue(count):
    async with database.async_session() as db:
        await db.execute(delete(Job).where(Job.kind == KIND))
        for n in range(count):
            await jobs.enqueue(db, KIND, {"n": n})
        await db.commit()


async def _clear():
    async with database.async_session() as db:
        await db.execute(delete(Job).where(Job.kind == KIND))
        await db.commit()
    await database.engine.dispose()


def _claim(db, worker, limit=3):
    return jobs.claim(db, [KIND], limit=limit, now=datetime.utcnow() + timedelta(seconds=1),
                      worker=worker, lease_seconds=60)


def test_a_claim_skips_the_jobs_another_worker_holds_without_waiting():
    async def scenario():
        await _queue(6)
        try:
            async with database.async_session() as holder:
                held = (await holder.execute(
                    select(Job.id).where(Job.kind == KIND).order_by(Job.id).limit(3).with_for_update()
                )).scalars().all()
                async with database.async_session() as db:
                    # Without SKIP LOCKED this would wait for the holder, here forever.
                    taken = await asyncio.wait_for(_claim(db, "pg:2:bbbb0000", limit=10), timeout=10)
                await holder.rollback()
            return held, [row.id for row in taken]
        finally:
            await _clear()
    held, taken = asyncio.run(scenario())
    assert len(held) == 3 and len(taken) == 3
    assert set(held).isdisjoint(taken)


def test_two_workers_claiming_at_once_each_take_their_own_jobs():
    async def scenario():
        await _queue(40)

        async def take(worker):
            taken = []
            while True:
                async with database.async_session() as db:
                    rows = await _claim(db, worker)
                if not rows:
                    return taken
                taken += [row.id for row in rows]
        try:
            return await asyncio.gather(take("pg:1:aaaa0000"), take("pg:2:bbbb0000"))
        finally:
            await _clear()
    first, second = asyncio.run(scenario())
    assert set(first).isdisjoint(second)
    assert len(first) + len(second) == 40

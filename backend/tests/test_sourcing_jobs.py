"""Find Candidates' searches, run by a background job.

A search ran inside one request and was saved only as it ended: Stop was the
browser closing the connection, and whoever was found but not yet judged was
lost.
"""
import asyncio
from datetime import datetime

from sqlalchemy import inspect, select

from conftest import register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ── what a run keeps ─────────────────────────────────────────────────────────

def test_a_run_keeps_where_it_stands_and_each_person_what_judging_them_took(client):
    from app.core import database
    from app.models.sourcing import SourcedProfile, SourcingRun
    _, m = register(client, "sj1@co.com")
    started = datetime(2026, 11, 21, 9, 0, 0)

    async def keep():
        async with database.async_session() as db:
            run = SourcingRun(manager_id=m["id"], description="Data engineers", status="queued",
                              sources={"uploads": True, "github": False, "web": True})
            db.add(run)
            await db.flush()
            # Its writes, counted from none.
            assert run.seq == 0
            run.status, run.seq, run.started_at, run.finished_at = "failed", 2, started, started
            run.warnings = ["Searching GitHub failed; carrying on without it."]
            run.error = "The search stopped unexpectedly."
            db.add(SourcedProfile(run_id=run.id, manager_id=m["id"], source="web", external_id="ada", name="Ada",
                                  seq=2, judge_ms=111, judge_tokens=439))
            await db.commit()
            return run.id

    async def read(run_id):
        async with database.async_session() as db:
            run = await db.get(SourcingRun, run_id)
            person = (await db.execute(select(SourcedProfile))).scalar_one()
            return ((run.status, run.sources, run.warnings, run.error, run.seq, run.started_at, run.finished_at),
                    (person.verdict, person.seq, person.judge_ms, person.judge_tokens))
    assert _run(read(_run(keep()))) == (
        ("failed", {"uploads": True, "github": False, "web": True}, ["Searching GitHub failed; carrying on without it."],
         "The search stopped unexpectedly.", 2, started, started),
        # Found, and not judged yet.
        (None, 2, 111, 439))


def test_what_changed_in_a_run_is_found_by_its_write_count(client):
    from app.core import database

    async def indexes():
        async with database.engine.connect() as conn:
            return await conn.run_sync(lambda sync: inspect(sync).get_indexes("sourced_profiles"))
    assert ("ix_sourced_profiles_run_id_seq", ["run_id", "seq"]) in [
        (index["name"], index["column_names"]) for index in _run(indexes())]

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


# ── the job that runs one ────────────────────────────────────────────────────

PLAN = {"req": {"title": "Backend Engineer"}, "criteria": [{"id": "c1", "label": "Python", "kind": "must"}],
        "filter": {}, "github_queries": [], "web_queries": []}


def _person(i, source="web", **fields):
    return {"pid": f"{source}:p{i}", "source": source, "external_id": f"p{i}", "name": f"Person {i}",
            "url": f"https://example.com/p{i}", "avatar_url": "", "email": "", "location": "Boston",
            "headline": "Engineer", **fields}


def _found(i, source="web", **fields):
    return {"type": "found", "person": _person(i, source, **fields)}


def _judged(i, source="web"):
    return {"type": "judged", "pid": f"{source}:p{i}", "verdict": "shortlist", "score": 80,
            "criteria": [{"id": "c1", "value": "Python", "level": "strong"}], "judgement": f"Judged {i}.",
            "filter_match": False, "miss_reason": "career_pivot", "ms": 120, "tokens": 400}


def _stats(found, judged):
    return {"type": "stats", "found": found, "judged": judged}


async def _queued(manager_id, status="queued", sources=None):
    """A run as starting one leaves it: queued, with its job."""
    from app.core import database
    from app.models.sourcing import SourcingRun
    from app.services import jobs, sourcing_search
    async with database.async_session() as db:
        run = SourcingRun(manager_id=manager_id, description="Backend engineer in Boston, strong Python",
                          status=status, sources=sources or {"uploads": True, "github": True, "web": True})
        db.add(run)
        await db.flush()
        await jobs.enqueue(db, sourcing_search.SEARCH, {"run_id": run.id}, manager_id=manager_id)
        await db.commit()
        return run.id


async def _written(run_id):
    """The run as written, and its people by pid, or None when it's gone."""
    from app.core import database
    from app.models.sourcing import SourcedProfile, SourcingRun
    async with database.async_session() as db:
        run = await db.get(SourcingRun, run_id)
        people = (await db.execute(select(SourcedProfile).where(SourcedProfile.run_id == run_id)
                                   .order_by(SourcedProfile.id))).scalars().all()
        written = {person.pid: person for person in people}
        assert len(written) == len(people), "someone written twice"
        return run, written


def _search(monkeypatch, script):
    """The search, played by `script`: (description, manager_id, sources) to its
    events. Each one is held here, so the job closes it, not the garbage collector."""
    from app.agents.sourcer_agent import sourcer_agent
    held = []

    def run_stream(*asked):
        held.append(script(*asked))
        return held[-1]
    monkeypatch.setattr(sourcer_agent, "run_stream", run_stream)
    return held


def test_the_server_runs_one_search_at_a_time_and_each_once():
    import main  # noqa: F401
    from app.services import jobs
    handler = jobs.handler_for("sourcing.search")
    assert (handler.lane, handler.concurrency, handler.max_attempts, handler.timeout_seconds,
            handler.on_failure is not None) == ("work", 1, 1, 30 * 60, True)


def test_a_search_is_written_to_its_run_from_start_to_end(client, run_jobs, monkeypatch):
    import sourcer_fakes as fakes
    from app.services.resume_rag import resume_rag
    fakes.install(monkeypatch, github_people=3, web_people=2)
    _, m = register(client, "sj3@co.com")
    fakes.seed_upload(resume_rag, m["id"], 1, "Maya Chen")
    run_id = _run(_queued(m["id"]))
    assert run_jobs() == ["done"]
    run, people = _run(_written(run_id))
    assert (run.status, run.error) == ("complete", None)
    assert run.started_at <= run.finished_at and run.seq >= 1
    assert run.plan["criteria"] and (run.stats["found"], run.stats["judged"]) == (6, 6)
    # The upload, 3 GitHub people and 2 from the web, each judged.
    assert sorted(people) == ["github:dev0", "github:dev1", "github:dev2", "upload:1",
                              "web:linkedin/web0", "web:linkedin/web1"]
    assert all(p.verdict in ("shortlist", "passed") and p.judgement for p in people.values())
    # Each one's share of their batch's time and tokens.
    assert all(isinstance(p.judge_ms, int) and p.judge_tokens > 0 for p in people.values())
    # A keyword filter on the title finds the upload and the web people, not GitHub's.
    assert {pid: p.filter_match for pid, p in people.items()} == {
        "upload:1": True, "web:linkedin/web0": True, "web:linkedin/web1": True,
        "github:dev0": False, "github:dev1": False, "github:dev2": False}
    # An address only where the upload had one.
    assert (people["upload:1"].email, people["github:dev0"].email) == ("maya@example.com", None)


def test_everyone_found_is_written_before_they_are_judged_with_no_connection_held(client, run_jobs, monkeypatch):
    from app.core import database
    _, m = register(client, "sj4@co.com")
    seen = []

    async def view():
        run, people = await _written(run_id)
        return run.status, run.seq, bool(run.plan), run.stats, {pid: (p.verdict, p.seq) for pid, p in people.items()}

    async def search(description, manager_id, sources):
        seen.append((description, manager_id, sources, database.engine.sync_engine.pool.checkedout()))
        yield {"type": "plan", "plan": PLAN}
        yield _found(0)
        yield _found(1)
        yield _stats(2, 0)
        seen.append(await view())
        yield _judged(0)
        yield _stats(2, 1)
        seen.append(await view())
        yield _stats(2, 1)
        yield {"type": "done", "stats": {"found": 2, "judged": 1}}
    _search(monkeypatch, search)
    run_id = _run(_queued(m["id"], sources={"uploads": False, "github": True, "web": True}))
    assert run_jobs() == ["done"]
    assert seen == [
        # What it was asked, and no connection held while it searches.
        ("Backend engineer in Boston, strong Python", m["id"], {"uploads": False, "github": True, "web": True}, 0),
        # Written as found, before they're judged.
        ("running", 1, True, {"found": 2, "judged": 0}, {"web:p0": (None, 1), "web:p1": (None, 1)}),
        # A judgement, in the write that came with it.
        ("running", 2, True, {"found": 2, "judged": 1}, {"web:p0": ("shortlist", 2), "web:p1": (None, 1)}),
    ]
    run, people = _run(_written(run_id))
    # The one never judged is kept, found.
    assert run.status == "complete" and people["web:p1"].verdict is None
    judged = people["web:p0"]
    assert (judged.score, judged.criteria, judged.judgement, judged.filter_match, judged.miss_reason,
            judged.judge_ms, judged.judge_tokens) == (
        80, [{"id": "c1", "value": "Python", "level": "strong"}], "Judged 0.", False, "career_pivot", 120, 400)


def test_a_stop_is_seen_at_the_next_write_keeping_everyone_found(client, run_jobs, monkeypatch):
    from sqlalchemy import update
    from app.core import database
    from app.models.sourcing import SourcingRun
    _, m = register(client, "sj5@co.com")
    told = []

    async def asked_to_stop():
        async with database.async_session() as db:
            await db.execute(update(SourcingRun).where(SourcingRun.id == run_id).values(status="stopping"))
            await db.commit()

    async def search(description, manager_id, sources):
        try:
            yield {"type": "plan", "plan": PLAN}
            yield _found(0)
            yield _stats(1, 0)
            await asked_to_stop()
            yield _found(1)
            yield _stats(2, 0)
            told.append("went on")
            yield _found(2)
            yield _stats(3, 0)
        finally:
            told.append("stopped")
    _search(monkeypatch, search)
    run_id = _run(_queued(m["id"]))
    assert run_jobs() == ["done"]
    run, people = _run(_written(run_id))
    assert (run.status, sorted(people), told) == ("stopped", ["web:p0", "web:p1"], ["stopped"])
    assert run.finished_at is not None


def test_a_run_deleted_meanwhile_ends_its_search_keeping_nothing(client, run_jobs, monkeypatch):
    from sqlalchemy import delete
    from app.core import database
    from app.models.sourcing import SourcedProfile, SourcingRun
    _, m = register(client, "sj6@co.com")
    told = []

    async def deleted():
        async with database.async_session() as db:
            await db.execute(delete(SourcedProfile).where(SourcedProfile.run_id == run_id))
            await db.execute(delete(SourcingRun).where(SourcingRun.id == run_id))
            await db.commit()

    async def search(description, manager_id, sources):
        try:
            yield _found(0)
            yield _stats(1, 0)
            await deleted()
            yield _found(1)
            yield _stats(2, 0)
            told.append("went on")
        finally:
            told.append("stopped")
    _search(monkeypatch, search)
    run_id = _run(_queued(m["id"]))
    assert run_jobs() == ["done"]
    assert _run(_written(run_id)) == (None, {}) and told == ["stopped"]


def test_a_server_stopping_mid_search_ends_it_stopped_with_everyone_found(client, run_jobs, monkeypatch):
    import contextlib
    from app.services import jobs
    _, m = register(client, "sj7@co.com")
    searched = []

    async def search(description, manager_id, sources):
        searched.append(description)
        yield _found(0)
        yield _stats(1, 0)
        yield _found(1)
        reached.set()
        await asyncio.Event().wait()  # searching on, until the server stops
    _search(monkeypatch, search)
    run_id = _run(_queued(m["id"]))

    async def stopped_part_way():
        task = asyncio.ensure_future(jobs.handler_for("sourcing.search").run({"run_id": run_id}))
        await asyncio.wait_for(reached.wait(), 5)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        return task.cancelled()
    reached = asyncio.Event()
    assert _run(stopped_part_way())
    run, people = _run(_written(run_id))
    # The one found since the last write is written too.
    assert (run.status, sorted(people)) == ("stopped", ["web:p0", "web:p1"]) and run.finished_at
    # Taken up again (the job went back in the queue), it ends at once.
    assert run_jobs() == ["done"] and searched == [searched[0]]
    assert _run(_written(run_id))[0].status == "stopped"


def test_a_run_a_try_began_and_never_ended_ends_stopped(client, run_jobs, monkeypatch):
    searched = []

    async def search(description, manager_id, sources):
        searched.append(description)
        yield _found(0)
    _search(monkeypatch, search)
    _, m = register(client, "sj8@co.com")
    # Left running, or asked to stop, by a server that stopped part way.
    ids = [_run(_queued(m["id"], status=status)) for status in ("running", "stopping")]
    assert run_jobs() == ["done", "done"]
    for run_id in ids:
        run, people = _run(_written(run_id))
        assert (run.status, people) == ("stopped", {}) and run.finished_at
    assert searched == []


def test_a_run_stopped_while_it_waited_is_never_searched(client, run_jobs, monkeypatch):
    searched = []

    async def search(description, manager_id, sources):
        searched.append(description)
        yield _found(0)
    _search(monkeypatch, search)
    _, m = register(client, "sj9@co.com")
    run_id = _run(_queued(m["id"], status="stopped"))
    assert run_jobs() == ["done"]
    run, _ = _run(_written(run_id))
    assert (run.status, run.finished_at, searched) == ("stopped", None, [])


def test_a_search_that_cannot_carry_on_fails_saying_why_with_its_warnings(client, run_jobs, monkeypatch):
    async def search(description, manager_id, sources):
        # As the search ends when a part of it breaks: the error, the last
        # stats, then done.
        yield {"type": "plan", "plan": PLAN}
        yield {"type": "warning", "message": "Searching GitHub failed; carrying on without it."}
        yield _found(0)
        yield _stats(1, 0)
        yield {"type": "warning", "message": "Searching the web failed; carrying on without it."}
        yield {"type": "error", "message": "The search stopped unexpectedly."}
        yield _stats(1, 0)
        yield {"type": "done", "stats": {"found": 1, "judged": 0}}
    _search(monkeypatch, search)
    _, m = register(client, "sj10@co.com")
    run_id = _run(_queued(m["id"]))
    assert run_jobs() == ["done"]
    run, people = _run(_written(run_id))
    assert (run.status, run.error, run.warnings, sorted(people)) == (
        "failed", "The search stopped unexpectedly.", ["Searching GitHub failed; carrying on without it.",
                                                       "Searching the web failed; carrying on without it."],
        ["web:p0"])


def test_a_search_that_breaks_fails_with_what_it_wrote(client, run_jobs, monkeypatch):
    async def search(description, manager_id, sources):
        yield _found(0)
        yield _stats(1, 0)
        raise RuntimeError("out of memory")
    _search(monkeypatch, search)
    _, m = register(client, "sj11@co.com")
    run_id = _run(_queued(m["id"]))
    assert run_jobs() == ["failed"]
    run, people = _run(_written(run_id))
    assert (run.status, run.error, sorted(people)) == ("failed", "The search stopped unexpectedly.", ["web:p0"])
    assert run.finished_at is not None


def test_a_search_whose_server_stopped_and_never_came_back_fails(client, run_jobs, monkeypatch):
    # Its worker gone part way, its lease out: it isn't run again.
    from datetime import timedelta
    from sqlalchemy import update
    from app.core import database
    from app.models.job import Job
    searched = []

    async def search(description, manager_id, sources):
        searched.append(description)
        yield _found(0)
    _search(monkeypatch, search)
    _, m = register(client, "sj12@co.com")
    # One part way, one its worker never began.
    ids = [_run(_queued(m["id"], status=status)) for status in ("running", "queued")]

    async def worker_gone():
        async with database.async_session() as db:
            await db.execute(update(Job).where(Job.kind == "sourcing.search").values(
                status="running", attempts=1, locked_by="gone:1:abc", locked_until=datetime.utcnow() - timedelta(minutes=1)))
            await db.commit()
    _run(worker_gone())
    assert run_jobs() == ["failed", "failed"]
    for run_id in ids:
        run, _ = _run(_written(run_id))
        assert (run.status, run.error) == ("failed", "The search stopped unexpectedly.") and run.finished_at
    assert searched == []


def test_a_found_persons_long_details_are_cut_to_their_columns(client, run_jobs, monkeypatch):
    async def search(description, manager_id, sources):
        yield _found(0, external_id="x" * 400, url="https://example.com/" + "u" * 600,
                     avatar_url="https://a/" + "a" * 600, headline="h" * 400, name="n" * 300,
                     location="l" * 300, email="e" * 300)
        yield _found(1, name="")  # a name the search couldn't read
        yield {"type": "done", "stats": {}}
    _search(monkeypatch, search)
    _, m = register(client, "sj13@co.com")
    run_id = _run(_queued(m["id"]))
    assert run_jobs() == ["done"]
    _, people = _run(_written(run_id))
    person, unnamed = people.values()
    assert unnamed.name == "Unknown"
    assert [len(getattr(person, column)) for column in (
        "external_id", "url", "avatar_url", "headline", "name", "location", "email")] == [300, 500, 500, 300, 200, 200, 200]

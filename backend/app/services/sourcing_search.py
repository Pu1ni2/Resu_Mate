"""Find Candidates' searches, run by a background job (sourcing.search).

A search ran inside the request that started it, everyone it found and
judged held in that request until the end: Stop was the browser closing the
connection, a closed tab stopped it too, and whoever was found but not yet
judged was lost. The job runs the same search (SourcerAgent.run_stream) and
writes it to its run as it goes, about once a second, as each stats event
comes: the plan, the stats, each person found, and each one's judgement once
written. A page follows the run, asking for what changed since the last
write it saw (SourcingRun.seq).

A run is queued, then running; asked to stop, stopping, until the job sees
it at its next write; then complete, stopped or failed. One runs at a time
on a server: they share its GitHub quota.
"""
import asyncio
from datetime import datetime
from typing import Optional

from sqlalchemy import update

from app.agents.sourcer_agent import sourcer_agent
from app.core import database
from app.models.auth import HiringManager
from app.models.sourcing import SourcedProfile, SourcingRun
from app.services import jobs
from app.services.hidden_names import hides_names

SEARCH = "sourcing.search"
ACTIVE = ("queued", "running", "stopping")
# Longer than any search: GitHub's 300 and the web's 30, and every upload,
# read five at a time by four judges.
LONGEST_SECONDS = 30 * 60
FAILED = "The search stopped unexpectedly."


def _cut(value, size: int) -> Optional[str]:
    """A text cut to its column, or None for nothing."""
    return value[:size] if value else None


class _Writes:
    """What the search has said since the run's last write, kept for its
    next one: the people found, their judgements, the plan, the stats, the
    warnings and the error."""

    def __init__(self, run_id: int):
        self.run_id = run_id
        self.ids = {}  # pid: the profile written for them
        self.failed = False  # the search said it couldn't carry on
        self._clear()

    def _clear(self) -> None:
        self.found, self.judged, self.run, self.warnings = {}, {}, {}, []

    def take(self, event: dict) -> None:
        kind = event["type"]
        if kind == "found":
            self.found[event["person"]["pid"]] = event["person"]
        elif kind == "judged":
            self.judged[event["pid"]] = event
        elif kind == "plan":
            self.run["plan"] = event["plan"]
        elif kind == "stats":
            self.run["stats"] = {key: value for key, value in event.items() if key != "type"}
        elif kind == "warning":
            self.warnings.append(event["message"])
        elif kind == "error":
            self.run["error"] = event["message"]
            self.failed = True

    async def write(self, **ending) -> Optional[str]:
        """Write what's kept as the run's next write, with `ending` (how it
        ended, and when), and say where the run stands now: "stopping" when
        it was asked to stop. None when it's gone, deleted meanwhile, and
        then nothing is written."""
        async with database.async_session() as db:
            run = await db.get(SourcingRun, self.run_id)
            if run is None:
                return None
            run.seq += 1
            added = []
            for pid, person in self.found.items():
                profile = SourcedProfile(
                    run_id=run.id, manager_id=run.manager_id, seq=run.seq,
                    source=person["source"], external_id=_cut(person["external_id"], 300),
                    name=_cut(person.get("name"), 200) or "Unknown", url=_cut(person.get("url"), 500),
                    avatar_url=_cut(person.get("avatar_url"), 500), email=_cut(person.get("email"), 200),
                    location=_cut(person.get("location"), 200), headline=_cut(person.get("headline"), 300),
                )
                db.add(profile)
                added.append((pid, profile))
            await db.flush()
            self.ids.update((pid, profile.id) for pid, profile in added)
            for pid, judged in self.judged.items():
                await db.execute(update(SourcedProfile).where(SourcedProfile.id == self.ids[pid]).values(
                    seq=run.seq, verdict=judged["verdict"], score=judged["score"], criteria=judged["criteria"],
                    judgement=judged["judgement"], filter_match=judged["filter_match"],
                    miss_reason=judged.get("miss_reason"), judge_ms=judged.get("ms"),
                    judge_tokens=judged.get("tokens"),
                ).execution_options(synchronize_session=False))
            run.warnings = [*(run.warnings or []), *self.warnings]
            for column, value in {**self.run, **ending}.items():
                setattr(run, column, value)
            status = run.status
            await db.commit()
            # Written: not to be written again, though this is cut off as
            # the session closes.
            self._clear()
        return status


async def _start(run_id: int):
    """Take up a queued run: running, from now; what it searches for, and
    whether its manager hides names, as the account says now. One that
    isn't queued was stopped while it waited, or was begun by a try that
    didn't end (the server stopped part way): that one ends stopped now,
    with what it wrote. None for either."""
    now = datetime.utcnow()
    async with database.async_session() as db:
        started = (await db.execute(
            update(SourcingRun).where(SourcingRun.id == run_id, SourcingRun.status == "queued")
            .values(status="running", started_at=now).execution_options(synchronize_session=False)
        )).rowcount == 1
        if not started:
            await db.execute(
                update(SourcingRun).where(SourcingRun.id == run_id, SourcingRun.status.in_(("running", "stopping")))
                .values(status="stopped", finished_at=now).execution_options(synchronize_session=False)
            )
            await db.commit()
            return None
        run = await db.get(SourcingRun, run_id)
        manager = await db.get(HiringManager, run.manager_id)
        asked = (run.description, run.manager_id, run.sources, hides_names(manager))
        await db.commit()
    return asked


async def _failed(db, job, code) -> None:
    """A search that ended in an error it couldn't carry on after, or whose
    server stopped part way and didn't come back in time: failed, with what
    it wrote."""
    await db.execute(
        update(SourcingRun).where(SourcingRun.id == job.payload["run_id"], SourcingRun.status.in_(ACTIVE))
        .values(status="failed", error=FAILED, finished_at=datetime.utcnow())
        .execution_options(synchronize_session=False)
    )


@jobs.handler(SEARCH, max_attempts=1, timeout_seconds=LONGEST_SECONDS, concurrency=1, on_failure=_failed)
async def run_search(payload: dict) -> None:
    """Run a queued search, writing it to its run as it goes, until it ends,
    is asked to stop, or the run is deleted. No database session is held
    while it searches: only for each write."""
    run_id = payload["run_id"]
    asked = await _start(run_id)
    if asked is None:
        return
    description, manager_id, sources, hidden = asked
    writes = _Writes(run_id)
    events = sourcer_agent.run_stream(description, manager_id, sources, hide_names=hidden)
    ending = None
    try:
        async for event in events:
            writes.take(event)
            if event["type"] == "stats":
                standing = await writes.write()
                if standing is None:
                    return  # deleted meanwhile: nothing to keep
                if standing == "stopping":
                    ending = "stopped"
                    break
    except asyncio.CancelledError:
        # The server is stopping, or the search outran its time: it ends
        # stopped, with what it found. When the job is taken up again, the
        # run isn't queued, and it ends at once.
        await writes.write(status="stopped", finished_at=datetime.utcnow())
        raise
    finally:
        await events.aclose()  # its finders and judges stop
    await writes.write(status=ending or ("failed" if writes.failed else "complete"), finished_at=datetime.utcnow())

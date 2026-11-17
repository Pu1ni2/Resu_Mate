"""The job runner: the server's own background workers, which take due jobs
from the jobs table and run them (app/services/jobs.py).

Jobs run in two lanes, each with a few slots: email, so a sign-in code is
never stuck behind a long report, and work, for the rest. A lane takes a
due job when it has a free slot and the job's kind is under its own cap,
such as one search at a time. It looks every few seconds, and at once when
a request's transaction queues a job (jobs.on_queued).

main.py's lifespan starts it with the server and stops it on shutdown: the
running jobs get a few seconds to end, and the rest go back in the queue,
their try not counted. Tests leave it off (JOBS_RUNNER=false) and run due
jobs themselves.
"""
import asyncio
import contextlib
import logging
import os
import secrets
import socket
from datetime import datetime
from typing import Dict, Optional

from app.core.errors import log_text
from app.services import jobs

logger = logging.getLogger("resumate.jobs")

# How often a lane looks for due jobs besides when it's woken: a job waiting
# for its retry, or for a later run_at, is found this way.
POLL_SECONDS = {jobs.EMAIL_LANE: 2.0, jobs.WORK_LANE: 5.0}
# How often the runner checks every periodic kind has its next run queued.
SCHEDULES_SECONDS = 300.0


def worker_name() -> str:
    """This process, as the jobs it holds name it: host:pid:random, so a job
    a stopped process held can't pass for its replacement's."""
    return f"{socket.gethostname()[:40]}:{os.getpid()}:{secrets.token_hex(4)}"


class Lane:
    """One lane's jobs, at most `slots` of them running at a time."""

    def __init__(self, name: str, slots: int, worker: str, poll_seconds: float):
        self.name = name
        self.slots = slots
        self.worker = worker
        self.poll_seconds = poll_seconds
        self.running: Dict[asyncio.Task, object] = {}  # each run, and the job it runs
        self.taking: Optional[asyncio.Task] = None
        self._woken = asyncio.Event()
        self._stopping = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self.taking = asyncio.create_task(self._take_jobs())
        jobs.on_queued(self.name, self.wake)

    def wake(self) -> None:
        """Look for due jobs now. Called once a transaction that queued one
        commits, from whichever thread committed it."""
        loop = self._loop
        if loop is not None and not loop.is_closed():
            loop.call_soon_threadsafe(self._woken.set)

    def stop_taking(self) -> None:
        self._stopping = True
        jobs.on_queued(self.name, None)
        self._woken.set()

    def _under_cap(self, kind: str) -> bool:
        cap = jobs.handler_for(kind).concurrency
        return cap is None or sum(1 for row in self.running.values() if row.kind == kind) < cap

    async def _take_jobs(self) -> None:
        while not self._stopping:
            try:
                await self._fill()
            except Exception as exc:
                # The database out of reach, say: tried again at the next look.
                logger.error("jobs %s lane: claiming failed: %s", self.name, log_text(exc))
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._woken.wait(), timeout=self.poll_seconds)
            self._woken.clear()

    async def _fill(self) -> None:
        """Claim due jobs, one at a time, while a slot is free."""
        from app.core.database import async_session
        while len(self.running) < self.slots and not self._stopping:
            kinds = [kind for kind in jobs.kinds_in(self.name) if self._under_cap(kind)]
            if not kinds:
                return
            # The longest lease of these kinds: a kind's first renewal comes a
            # quarter of its own lease in, and must come before this one ends.
            lease = max(jobs.handler_for(kind).lease_seconds for kind in kinds)
            async with async_session() as db:
                rows = await jobs.claim(db, kinds, limit=1, now=datetime.utcnow(), worker=self.worker,
                                        lease_seconds=lease)
            if not rows:
                return
            task = asyncio.create_task(self._run(rows[0]))
            self.running[task] = rows[0]
            task.add_done_callback(self._ended)

    def _ended(self, task: asyncio.Task) -> None:
        self.running.pop(task, None)
        self._woken.set()  # a slot is free

    async def _run(self, row) -> None:
        try:
            await jobs.run_claimed(row, self.worker)
        except asyncio.CancelledError:
            # The server is stopping: the job goes back in the queue.
            await jobs.release(row, self.worker)
            raise
        except Exception as exc:
            # Its outcome couldn't be written: the job is taken up again
            # once its lease runs out.
            logger.error("job %s %s not settled: %s", row.id, row.kind, log_text(exc))


async def _keep_schedules(stopped: asyncio.Event, every_seconds: float) -> None:
    """Every periodic kind's next run queued (jobs.ensure_schedules): now,
    then every few minutes, until the runner stops."""
    while not stopped.is_set():
        try:
            await jobs.ensure_schedules()
        except Exception as exc:
            logger.error("jobs schedules not checked: %s", log_text(exc))
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(stopped.wait(), timeout=every_seconds)


class Runner:
    """This process's lanes, and the check that keeps the schedules."""

    def __init__(self, lanes: list, schedules_seconds: float = SCHEDULES_SECONDS):
        self.lanes = lanes
        self._stopped = asyncio.Event()
        self.keeping = asyncio.create_task(_keep_schedules(self._stopped, schedules_seconds))

    def running(self) -> int:
        return sum(len(lane.running) for lane in self.lanes)

    async def stop(self, grace_seconds: float) -> None:
        """Take no more jobs, give the running ones grace_seconds to end,
        then stop the rest: each goes back in the queue, its try not
        counted."""
        self._stopped.set()
        for lane in self.lanes:
            lane.stop_taking()
        taking = [task for task in (self.keeping, *(lane.taking for lane in self.lanes)) if task is not None]
        if taking:
            # A claim or a schedules check under way finishes first, so no
            # job is claimed and left.
            _, stuck = await asyncio.wait(taking, timeout=grace_seconds)
            for task in stuck:
                task.cancel()
            await asyncio.gather(*taking, return_exceptions=True)
        runs = [task for lane in self.lanes for task in lane.running]
        unfinished = set()
        if runs:
            _, unfinished = await asyncio.wait(runs, timeout=grace_seconds)
            for task in unfinished:
                task.cancel()
            await asyncio.gather(*unfinished, return_exceptions=True)
        logger.info("jobs runner stopped: %s of %s running jobs put back", len(unfinished), len(runs))


def start(work_slots: int, email_slots: int, poll_seconds: Optional[dict] = None,
          schedules_seconds: float = SCHEDULES_SECONDS) -> Runner:
    """Start this process's lanes, in the running event loop, then the
    check that queues each periodic kind's next run: the lanes are woken
    when it commits."""
    poll = poll_seconds or POLL_SECONDS
    worker = worker_name()
    lanes = [Lane(jobs.EMAIL_LANE, email_slots, worker, poll[jobs.EMAIL_LANE]),
             Lane(jobs.WORK_LANE, work_slots, worker, poll[jobs.WORK_LANE])]
    for lane in lanes:
        lane.start()
    logger.info("jobs runner started as %s", worker)
    return Runner(lanes, schedules_seconds)

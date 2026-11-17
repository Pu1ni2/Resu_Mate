"""The job queue: slow work kept in the jobs table (app/models/job.py) and
done in the background by the job runner.

Uploads, invitations, reports and searches ran inside the request that asked
for them, so closing the page, or a restart, lost the work. A request now
queues a job instead (enqueue), inside its own transaction: the job exists
exactly when the request's other changes do, and the request answers at
once.
"""
import asyncio
import contextlib
import logging
import random
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Awaitable, Callable, Iterable, Optional

from sqlalchemy import and_, event, insert, or_, select, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.core.errors import log_text
from app.models.job import Job

# A kind names what to do: "report.write", "email.sign_in_code".
KIND = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$")
# A payload's keys, and its text values: ids, flags and short codes only.
CODE = re.compile(r"^[a-z0-9_.:-]{1,64}$")
# Kinds that send email run in a lane of their own, so a sign-in code isn't
# stuck behind a long report.
EMAIL_LANE, WORK_LANE = "email", "work"

_wakers: dict = {}
_QUEUED = "resumate_jobs_queued_lanes"

logger = logging.getLogger("resumate.jobs")


class UnsafePayload(ValueError):
    """A payload value that could be someone's personal data."""


def check_payload(payload: dict) -> dict:
    """The payload, if it holds only ids, flags and short codes.

    So the jobs table never holds a name, an address or a résumé: a job
    carries the ids it works on, and reads the rest when it runs. The error
    names the key, never the value.
    """
    for key, value in payload.items():
        if not (isinstance(key, str) and CODE.match(key)):
            raise UnsafePayload("a key that isn't a short code")
        if value is None or isinstance(value, (bool, int)):
            continue
        if isinstance(value, str) and CODE.match(value):
            continue
        raise UnsafePayload(f"{key} holds a {type(value).__name__} that isn't an id, a flag or a short code")
    return payload


def lane_of(kind: str) -> str:
    return EMAIL_LANE if kind.startswith("email.") else WORK_LANE


def on_queued(lane: str, wake: Optional[Callable[[], None]]) -> None:
    """Have wake() called when a transaction that queued a job in this lane
    commits (the runner's lanes do), or stop it with None."""
    if wake is None:
        _wakers.pop(lane, None)
    else:
        _wakers[lane] = wake


async def enqueue(db, kind: str, payload: Optional[dict] = None, *, dedupe_key: Optional[str] = None,
                  run_at: Optional[datetime] = None, priority: Optional[int] = None,
                  max_attempts: Optional[int] = None, manager_id: Optional[int] = None) -> Optional[int]:
    """Queue a job in the caller's transaction; its id, or None when a job
    with this dedupe_key is already queued or running.

    Nothing is committed here: the job is queued when the caller commits,
    with the rest of what the request changed, and its lane is woken then.
    Its priority and attempts are its kind's (handler), unless given.
    """
    if not KIND.match(kind or "") or len(kind) > 64:
        raise ValueError("a job's kind is a short dotted name, such as report.write")
    if dedupe_key is not None and not CODE.match(dedupe_key):
        raise UnsafePayload("dedupe_key isn't a short code")
    declared = _handlers.get(kind)
    if priority is None:
        priority = declared.priority if declared else 100
    if max_attempts is None:
        max_attempts = declared.max_attempts if declared else 5
    now = datetime.utcnow()
    values = dict(
        kind=kind, payload=check_payload(dict(payload or {})), status="queued", priority=priority,
        run_at=run_at or now, attempts=0, max_attempts=max_attempts, cancel_requested=False,
        dedupe_key=dedupe_key, manager_id=manager_id, created_at=now,
    )
    table = Job.__table__
    dialect = db.get_bind().dialect.name
    # A key already held by an active job: nothing is queued, and no error
    # spoils the caller's transaction.
    if dialect == "postgresql":
        statement = postgresql.insert(table).values(**values).on_conflict_do_nothing(constraint="uq_jobs_dedupe_key")
    elif dialect == "sqlite":
        statement = sqlite.insert(table).values(**values).on_conflict_do_nothing(index_elements=["dedupe_key"])
    else:
        statement = insert(table).values(**values)
    job_id = (await db.execute(statement.returning(table.c.id))).scalar_one_or_none()
    if job_id is not None:
        db.sync_session.info.setdefault(_QUEUED, set()).add(lane_of(kind))
    return job_id


# What a worker is handed about each job it claims, and what a kind's
# on_failure and on_cancel are given.
_ROW = (Job.id, Job.kind, Job.payload, Job.attempts, Job.max_attempts, Job.priority, Job.run_at,
        Job.manager_id, Job.created_at, Job.cancel_requested)


def _due(kinds: Iterable[str], now: datetime):
    """Queued jobs whose time has come, and running ones whose worker's lease
    ran out: it stopped, or lost the job."""
    return and_(
        Job.kind.in_(list(kinds)),
        or_(
            and_(Job.status == "queued", Job.run_at <= now),
            and_(Job.status == "running", Job.locked_until < now),
        ),
    )


async def claim(db, kinds: Iterable[str], *, limit: int, now: datetime, worker: str, lease_seconds: int) -> list:
    """Take up to `limit` due jobs of these kinds for this worker, and commit.

    Each is marked running, by `worker`, until now plus the lease, and its
    attempt is counted. On Postgres, processes claiming at once never take
    the same job (FOR UPDATE SKIP LOCKED); SQLite writes one at a time. The
    kinds are those this process can do, so an older process, during a
    deploy, never takes a kind it doesn't know. Returns them, most urgent
    first, for run_claimed: it also ends the jobs that mustn't run again,
    such as one past its last attempt.
    """
    picked = (select(Job.id).where(_due(kinds, now))
              .order_by(Job.priority, Job.run_at, Job.id).limit(limit))
    if db.get_bind().dialect.name == "postgresql":
        next_jobs = picked.with_for_update(skip_locked=True).cte("next_jobs")
        statement = update(Job).where(Job.id == next_jobs.c.id)
    else:
        statement = update(Job).where(Job.id.in_(picked))
    statement = (
        statement.values(status="running", locked_by=worker, heartbeat_at=now, started_at=now,
                         locked_until=now + timedelta(seconds=lease_seconds), attempts=Job.attempts + 1)
        .returning(*_ROW)
        .execution_options(synchronize_session=False)
    )
    rows = (await db.execute(statement)).all()
    await db.commit()
    return sorted(rows, key=lambda row: (row.priority, row.run_at, row.id))


class PermanentError(Exception):
    """Raised by a handler for a failure no retry would fix; `code` (a short
    code) is what the job records."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class Defer(Exception):
    """Raised by a handler that can't run yet, such as one waiting for a
    résumé's analysis: the job runs again after `seconds`, and the try
    isn't counted. A job still waiting after DEFER_LIMIT fails instead."""

    def __init__(self, seconds: float = 30):
        super().__init__(f"deferred {seconds}s")
        self.seconds = seconds


DEFER_LIMIT = timedelta(minutes=30)


@dataclass(frozen=True)
class Handler:
    kind: str
    run: Callable[[dict], Awaitable[None]]
    lane: str
    max_attempts: int
    lease_seconds: int
    timeout_seconds: float
    backoff_base: float
    backoff_cap: float
    priority: int
    concurrency: Optional[int]
    on_failure: Optional[Callable]
    on_cancel: Optional[Callable]


_handlers: dict = {}


def handler(kind: str, *, max_attempts: int = 5, lease_seconds: float = 120, timeout_seconds: float = 600,
            backoff: tuple = (10, 600), priority: int = 100, concurrency: Optional[int] = None,
            on_failure: Optional[Callable] = None, on_cancel: Optional[Callable] = None):
    """Register what a kind of job does: `async def run(payload)`.

    It opens its own database sessions, and holds none across a call to the
    AI or the email service. on_failure(db, job, code) runs when the job
    fails for good, and on_cancel(db, job, code) when it's stopped on
    request (request_cancel), each in the same transaction that records it.
    """
    if not KIND.match(kind) or len(kind) > 64:
        raise ValueError("a job's kind is a short dotted name, such as report.write")

    def register(run):
        _handlers[kind] = Handler(kind, run, lane_of(kind), max_attempts, lease_seconds, timeout_seconds,
                                  backoff[0], backoff[1], priority, concurrency, on_failure, on_cancel)
        return run
    return register


def kinds_in(lane: str) -> list:
    return sorted(kind for kind, h in _handlers.items() if h.lane == lane)


def _retryable(exc: BaseException) -> bool:
    """A failure that a later try may not meet: a service busy or out of
    reach, a timeout, the database briefly unavailable."""
    import httpx
    import openai
    from sqlalchemy.exc import OperationalError
    return isinstance(exc, (
        TimeoutError, ConnectionError, OperationalError, httpx.TransportError,
        openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError,
    ))


def error_code(prefix: str, exc: BaseException) -> str:
    """What a job records about a failure: the kind of failure and the
    exception's class, never its text, which can hold anyone's data."""
    return f"{prefix}:{type(exc).__name__}"[:200]


def backoff_seconds(attempt: int, base: float, cap: float) -> float:
    """The wait before the next try: doubling from `base`, at most `cap`,
    give or take a fifth, so jobs that failed together don't all retry
    together."""
    return min(cap, base * 2 ** (attempt - 1)) * random.uniform(0.8, 1.2)


_RELEASED = dict(locked_by=None, locked_until=None, heartbeat_at=None)


async def _settle(row, worker: str, values: dict, outcome: str, code: Optional[str] = None,
                  then: Optional[Callable] = None, unless_stopped: bool = False) -> Optional[str]:
    """Write a claimed job's next state, if `worker` still holds it, and run
    `then` (its kind's on_failure or on_cancel) in the same transaction.
    Returns the outcome, or None when nothing was written.

    The where clause is the fence: a worker whose lease ran out, and whose
    job another worker took up, changes nothing. With unless_stopped,
    neither does one whose job someone asked to stop.
    """
    from app.core.database import async_session
    fence = [Job.id == row.id, Job.locked_by == worker, Job.status == "running"]
    if unless_stopped:
        fence.append(Job.cancel_requested.is_(False))
    async with async_session() as db:
        result = await db.execute(
            update(Job).where(*fence).values(**values).execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            await db.rollback()
            return None
        if then is not None:
            await then(db, row, code)
        await db.commit()
    logger.info("job %s %s %s %s", row.id, row.kind, outcome, code or "-")
    return outcome


def _lost(row) -> str:
    logger.warning("job %s %s lost -", row.id, row.kind)
    return "lost"


async def _cancel(found, row, worker: str, now: Callable[[], datetime]) -> str:
    """End a job someone asked to stop: cancelled, its key free, and its
    kind's on_cancel run."""
    return (await _settle(row, worker, dict(status="cancelled", dedupe_key=None, finished_at=now(), **_RELEASED),
                          "cancelled", "cancelled", found.on_cancel)
            or _lost(row))


async def _unfinished(found, row, worker: str, now: Callable[[], datetime], values: dict, outcome: str,
                      code: Optional[str] = None, then: Optional[Callable] = None) -> str:
    """Write a run that didn't finish its work (queued again, or failed),
    unless someone asked the job to stop meanwhile: then it's cancelled
    instead, and never runs again."""
    return (await _settle(row, worker, {**values, **_RELEASED}, outcome, code, then, unless_stopped=True)
            or await _cancel(found, row, worker, now))


async def _heartbeat(row, worker: str, lease_seconds: float, now: Callable[[], datetime],
                     ended: asyncio.Event) -> Optional[str]:
    """Renew this worker's lease on a running job every quarter of it, so a
    long job isn't taken up by another worker halfway, until the run ends.
    Returns "lost" when another worker holds the job now, "cancelled" when
    someone asked it to stop, or None once the run has ended. A renewal the
    database refuses is tried again next time.

    It stops between renewals, never during one: a write cut off halfway
    can leave the database locked, and its connection never handed back.
    """
    from app.core.database import async_session
    while True:
        try:
            await asyncio.wait_for(ended.wait(), timeout=lease_seconds / 4)
            return None
        except TimeoutError:
            pass
        try:
            async with async_session() as db:
                held = (await db.execute(
                    update(Job).where(Job.id == row.id, Job.locked_by == worker, Job.status == "running")
                    .values(locked_until=now() + timedelta(seconds=lease_seconds), heartbeat_at=now())
                    .returning(Job.cancel_requested).execution_options(synchronize_session=False)
                )).first()
                await db.commit()
        except Exception as exc:
            logger.warning("job %s %s heartbeat failed: %s", row.id, row.kind, log_text(exc))
            continue
        if held is None:
            return "lost"
        if held.cancel_requested:
            return "cancelled"


async def _run_watched(found, row, worker: str, now: Callable[[], datetime]) -> Optional[str]:
    """The kind's run, within its time limit, with the heartbeat beside it.

    Returns None when the run ended, raising whatever it raised, or "lost"
    or "cancelled" when the heartbeat stopped it first; in each case, once
    both have ended.
    """
    ended = asyncio.Event()
    work = asyncio.ensure_future(asyncio.wait_for(found.run(dict(row.payload)), timeout=found.timeout_seconds))
    beat = asyncio.ensure_future(_heartbeat(row, worker, found.lease_seconds, now, ended))
    try:
        await asyncio.wait({work, beat}, return_when=asyncio.FIRST_COMPLETED)
        if work.done():
            work.result()
            return None
        return beat.result()
    finally:
        ended.set()
        if not work.done():
            work.cancel()
        for task in (work, beat):
            with contextlib.suppress(BaseException):
                await task


async def run_claimed(row, worker: str, now: Callable[[], datetime] = datetime.utcnow) -> str:
    """Run one job this worker claimed, and write where it ends up: done,
    retry (queued again, after a wait), deferred (queued again, the try
    not counted), failed, cancelled (stopped on request), or lost. Returns
    that.

    A run longer than its kind's timeout is stopped, and tried again like
    any timeout: a stuck call to the AI can't hold a worker forever.

    A job asked to stop never runs again: one asked before this worker
    took it up isn't run, and a run that then ends any way but done ends
    cancelled. A job past its last attempt, whose worker stopped during
    it, isn't run either: it fails as lease_expired, with its kind's
    on_failure.
    """
    found = _handlers.get(row.kind)
    if found is None:
        return (await _settle(row, worker, dict(status="failed", last_error="unknown_kind", dedupe_key=None,
                                                finished_at=now(), **_RELEASED), "failed", "unknown_kind")
                or _lost(row))
    if row.cancel_requested:
        return await _cancel(found, row, worker, now)
    if row.attempts > row.max_attempts:
        return await _unfinished(found, row, worker, now, dict(
            status="failed", last_error="lease_expired", dedupe_key=None, finished_at=now()),
            "failed", "lease_expired", found.on_failure)
    try:
        stopped = await _run_watched(found, row, worker, now)
    except Defer as wait:
        if now() - row.created_at <= DEFER_LIMIT:
            return await _unfinished(found, row, worker, now, dict(
                status="queued", attempts=row.attempts - 1, run_at=now() + timedelta(seconds=wait.seconds)),
                "deferred")
        code = "waited_too_long"
    except PermanentError as stop:
        code = stop.code[:200]
    except Exception as exc:
        if _retryable(exc) and row.attempts < row.max_attempts:
            code = error_code("retry", exc)
            wait = timedelta(seconds=backoff_seconds(row.attempts, found.backoff_base, found.backoff_cap))
            return await _unfinished(found, row, worker, now, dict(
                status="queued", run_at=now() + wait, last_error=code), "retry", code)
        code = error_code("error", exc)
    else:
        if stopped == "lost":
            return _lost(row)
        if stopped == "cancelled":
            return await _cancel(found, row, worker, now)
        return (await _settle(row, worker, dict(status="done", dedupe_key=None, last_error=None,
                                                finished_at=now(), **_RELEASED), "done")
                or _lost(row))
    return await _unfinished(found, row, worker, now, dict(
        status="failed", last_error=code, dedupe_key=None, finished_at=now()), "failed", code, found.on_failure)


async def request_cancel(db, job_id: int) -> Optional[str]:
    """Ask a job to stop, in the caller's transaction: nothing is committed
    here. A queued one is cancelled at once, and its kind's on_cancel runs
    in that transaction. A running one stops at its worker's next
    heartbeat, within a quarter of its lease, and on_cancel runs then.
    Returns the job's status now, or None when there's no such job."""
    queued = (await db.execute(
        update(Job).where(Job.id == job_id, Job.status == "queued")
        .values(status="cancelled", cancel_requested=True, dedupe_key=None, finished_at=datetime.utcnow())
        .returning(*_ROW).execution_options(synchronize_session=False)
    )).first()
    if queued is not None:
        found = _handlers.get(queued.kind)
        if found is not None and found.on_cancel is not None:
            await found.on_cancel(db, queued, "cancelled")
        return "cancelled"
    running = (await db.execute(
        update(Job).where(Job.id == job_id, Job.status == "running").values(cancel_requested=True)
        .returning(Job.id).execution_options(synchronize_session=False)
    )).scalar_one_or_none()
    if running is not None:
        return "running"
    return (await db.execute(select(Job.status).where(Job.id == job_id))).scalar_one_or_none()


@event.listens_for(Session, "after_commit")
def _wake_lanes(session):
    for lane in session.info.pop(_QUEUED, ()):
        wake = _wakers.get(lane)
        if wake is not None:
            wake()


@event.listens_for(Session, "after_rollback")
def _forget_lanes(session):
    session.info.pop(_QUEUED, None)

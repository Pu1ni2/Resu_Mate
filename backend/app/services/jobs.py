"""The job queue: slow work kept in the jobs table (app/models/job.py) and
done in the background by the job runner.

Uploads, invitations, reports and searches ran inside the request that asked
for them, so closing the page, or a restart, lost the work. A request now
queues a job instead (enqueue), inside its own transaction: the job exists
exactly when the request's other changes do, and the request answers at
once.
"""
import logging
import random
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Awaitable, Callable, Iterable, Optional

from sqlalchemy import and_, event, insert, or_, select, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

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
    deploy, never takes a kind it doesn't know. A job past its last attempt
    fails as lease_expired instead of running again. Returns the rest, most
    urgent first.
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
        .returning(Job.id, Job.kind, Job.payload, Job.attempts, Job.max_attempts, Job.priority,
                   Job.run_at, Job.manager_id, Job.created_at)
        .execution_options(synchronize_session=False)
    )
    rows = (await db.execute(statement)).all()
    spent = [row.id for row in rows if row.attempts > row.max_attempts]
    if spent:
        await db.execute(
            update(Job).where(Job.id.in_(spent), Job.locked_by == worker)
            .values(status="failed", last_error="lease_expired", dedupe_key=None, finished_at=now,
                    locked_by=None, locked_until=None)
            .execution_options(synchronize_session=False)
        )
    await db.commit()
    return sorted((row for row in rows if row.id not in spent), key=lambda row: (row.priority, row.run_at, row.id))


class PermanentError(Exception):
    """Raised by a handler for a failure no retry would fix; `code` (a short
    code) is what the job records."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


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


_handlers: dict = {}


def handler(kind: str, *, max_attempts: int = 5, lease_seconds: int = 120, timeout_seconds: float = 600,
            backoff: tuple = (10, 600), priority: int = 100, concurrency: Optional[int] = None,
            on_failure: Optional[Callable] = None):
    """Register what a kind of job does: `async def run(payload)`.

    It opens its own database sessions, and holds none across a call to the
    AI or the email service. on_failure(db, job, code) runs when the job
    fails for good, in the same transaction that records the failure.
    """
    if not KIND.match(kind) or len(kind) > 64:
        raise ValueError("a job's kind is a short dotted name, such as report.write")

    def register(run):
        _handlers[kind] = Handler(kind, run, lane_of(kind), max_attempts, lease_seconds, timeout_seconds,
                                  backoff[0], backoff[1], priority, concurrency, on_failure)
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


async def _settle(row, worker: str, values: dict, outcome: str, code: Optional[str] = None,
                  on_failure: Optional[Callable] = None) -> str:
    """Write a claimed job's next state, if `worker` still holds it.

    The where clause is the fence: a worker whose lease ran out, and whose
    job another worker took up, changes nothing, and reports the job lost.
    """
    from app.core.database import async_session
    async with async_session() as db:
        result = await db.execute(
            update(Job).where(Job.id == row.id, Job.locked_by == worker, Job.status == "running")
            .values(**values).execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            await db.rollback()
            logger.warning("job %s %s lost -", row.id, row.kind)
            return "lost"
        if on_failure is not None:
            await on_failure(db, row, code)
        await db.commit()
    logger.info("job %s %s %s %s", row.id, row.kind, outcome, code or "-")
    return outcome


async def run_claimed(row, worker: str, now: Callable[[], datetime] = datetime.utcnow) -> str:
    """Run one job this worker claimed, and write where it ends up: done,
    retry (queued again, after a wait), failed, or lost. Returns that."""
    found = _handlers.get(row.kind)
    released = dict(locked_by=None, locked_until=None, heartbeat_at=None)
    if found is None:
        return await _settle(row, worker, dict(status="failed", last_error="unknown_kind", dedupe_key=None,
                                               finished_at=now(), **released), "failed", "unknown_kind")
    try:
        await found.run(dict(row.payload))
    except PermanentError as stop:
        code = stop.code[:200]
    except Exception as exc:
        if _retryable(exc) and row.attempts < row.max_attempts:
            code = error_code("retry", exc)
            wait = timedelta(seconds=backoff_seconds(row.attempts, found.backoff_base, found.backoff_cap))
            return await _settle(row, worker, dict(status="queued", run_at=now() + wait, last_error=code,
                                                   **released), "retry", code)
        code = error_code("error", exc)
    else:
        return await _settle(row, worker, dict(status="done", dedupe_key=None, last_error=None,
                                               finished_at=now(), **released), "done")
    return await _settle(row, worker, dict(status="failed", last_error=code, dedupe_key=None,
                                           finished_at=now(), **released), "failed", code, found.on_failure)


@event.listens_for(Session, "after_commit")
def _wake_lanes(session):
    for lane in session.info.pop(_QUEUED, ()):
        wake = _wakers.get(lane)
        if wake is not None:
            wake()


@event.listens_for(Session, "after_rollback")
def _forget_lanes(session):
    session.info.pop(_QUEUED, None)

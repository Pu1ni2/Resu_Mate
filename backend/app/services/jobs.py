"""The job queue: slow work kept in the jobs table (app/models/job.py) and
done in the background by the job runner.

Uploads, invitations, reports and searches ran inside the request that asked
for them, so closing the page, or a restart, lost the work. A request now
queues a job instead (enqueue), inside its own transaction: the job exists
exactly when the request's other changes do, and the request answers at
once.
"""
import re
from datetime import datetime
from typing import Callable, Optional

from sqlalchemy import event, insert
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
                  run_at: Optional[datetime] = None, priority: int = 100, max_attempts: int = 5,
                  manager_id: Optional[int] = None) -> Optional[int]:
    """Queue a job in the caller's transaction; its id, or None when a job
    with this dedupe_key is already queued or running.

    Nothing is committed here: the job is queued when the caller commits,
    with the rest of what the request changed, and its lane is woken then.
    """
    if not KIND.match(kind or "") or len(kind) > 64:
        raise ValueError("a job's kind is a short dotted name, such as report.write")
    if dedupe_key is not None and not CODE.match(dedupe_key):
        raise UnsafePayload("dedupe_key isn't a short code")
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


@event.listens_for(Session, "after_commit")
def _wake_lanes(session):
    for lane in session.info.pop(_QUEUED, ()):
        wake = _wakers.get(lane)
        if wake is not None:
            wake()


@event.listens_for(Session, "after_rollback")
def _forget_lanes(session):
    session.info.pop(_QUEUED, None)

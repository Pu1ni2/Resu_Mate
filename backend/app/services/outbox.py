"""Emails through the outbox: each is queued with what it is (app/models/
email_outbox.py) and sent by a background job, email.send, in the email lane,
where slow work doesn't hold up a sign-in code.

The job makes the email as it sends it: the address from the account or the
interview, a code or a link fresh, so none is stored. When the email service
is busy, slow or out of reach, the email is tried again after a growing wait;
when the service refuses it, or email isn't set up, it fails, saying why.
Once it has ended, the address typed for a code and a draft's words are
wiped.
"""
import logging
from datetime import datetime
from typing import Awaitable, Callable, Dict, Optional, Tuple

from sqlalchemy import insert, select, update
from sqlalchemy.dialects import postgresql, sqlite

from app.core import database
from app.models.email_outbox import KINDS, EmailOutbox
from app.services import jobs
from app.services.email_service import BUSY, OFF, SENT, email_service

logger = logging.getLogger("resumate.outbox")

SEND = "email.send"

# Someone is waiting at a page for these: they go before any other email.
URGENT = ("sign_in_code", "erasure_code", "password_reset")

# An email still to go. Any other status has ended: sent, failed, skipped or
# cancelled.
PENDING = ("held", "queued")

NOT_SET_UP = "Email isn't set up on this server."
REFUSED = "The email service refused it."
NO_ANSWER = "The email service didn't answer, so it wasn't sent."
BROKE = "Something went wrong on the server, so it wasn't sent."
UNKNOWN = "This kind of email can't be sent yet."

# What each kind of email says, and to whom: (address, subject, html), made
# as it's sent; or None when there's nothing to send after all, such as a
# code asked for an address no one invited. Each kind registers its own.
Composed = Optional[Tuple[str, str, str]]
COMPOSERS: Dict[str, Callable[..., Awaitable[Composed]]] = {}


def composer(kind: str):
    """Register what a kind of email says: async def make(db, email)."""
    if kind not in KINDS:
        raise ValueError("not a kind of email the outbox keeps")

    def register(make):
        COMPOSERS[kind] = make
        return make
    return register


class EmailBusy(ConnectionError):
    """The email service busy, slow or out of reach: the job tries again."""


async def queue(db, kind: str, *, manager_id: Optional[int] = None, interview_id: Optional[int] = None,
                to_address: Optional[str] = None, subject: Optional[str] = None, body: Optional[str] = None,
                counts_to_quota: bool = False, dedupe_key: Optional[str] = None,
                held: bool = False) -> Optional[int]:
    """Queue an email, and the job that sends it, in the caller's
    transaction; its id, or None when one with this dedupe_key is queued,
    held or sent already. Nothing is committed here.

    Held, it waits with no job until its interview's questions are written
    (release): an invitation to an interview that would ask nothing of its
    own yet. It counts toward the day's emails all the same."""
    if kind not in KINDS:
        raise ValueError("not a kind of email the outbox keeps")
    values = dict(kind=kind, manager_id=manager_id, interview_id=interview_id, to_address=to_address,
                  subject=subject, body=body, counts_to_quota=counts_to_quota,
                  status="held" if held else "queued", dedupe_key=dedupe_key, created_at=datetime.utcnow())
    table = EmailOutbox.__table__
    dialect = db.get_bind().dialect.name
    # A key already taken: nothing is queued, and no error spoils the
    # caller's transaction.
    if dialect == "postgresql":
        statement = postgresql.insert(table).values(**values).on_conflict_do_nothing(
            constraint="uq_email_outbox_dedupe_key")
    elif dialect == "sqlite":
        statement = sqlite.insert(table).values(**values).on_conflict_do_nothing(index_elements=["dedupe_key"])
    else:
        statement = insert(table).values(**values)
    email_id = (await db.execute(statement.returning(table.c.id))).scalar_one_or_none()
    if email_id is not None and not held:
        await _send_later(db, email_id, kind, manager_id)
    return email_id


async def _send_later(db, email_id: int, kind: str, manager_id: Optional[int]) -> None:
    await jobs.enqueue(db, SEND, {"email_id": email_id}, dedupe_key=f"email:{email_id}",
                       priority=0 if kind in URGENT else 100, manager_id=manager_id)


async def release(db, interview_id: int) -> int:
    """Send the emails held for an interview, its questions written: each
    queued, with the job that sends it, in the caller's transaction. How
    many."""
    held = (await db.execute(select(EmailOutbox).where(
        EmailOutbox.interview_id == interview_id, EmailOutbox.status == "held"))).scalars().all()
    for email in held:
        email.status = "queued"
        await _send_later(db, email.id, email.kind, email.manager_id)
    return len(held)


async def _end(db, email_id: int, status: str, error: Optional[str] = None) -> None:
    """An email that has ended: what it ended as, and why not. The typed
    address and a draft's words go; a key goes too unless it was sent, so
    another may be queued."""
    values = dict(status=status, error=error, finished_at=datetime.utcnow(), to_address=None, subject=None,
                  body=None)
    if status != "sent":
        values["dedupe_key"] = None
    await db.execute(update(EmailOutbox).where(EmailOutbox.id == email_id, EmailOutbox.status == "queued")
                     .values(**values))


async def _failed(db, job, code) -> None:
    """Tried as often as it may be, the service busy, slow or out of reach
    each time; or stopped by a fault of the server's own, which isn't the
    service's doing. It said the service didn't answer for either."""
    busy = code == jobs.error_code("error", EmailBusy())
    await _end(db, job.payload["email_id"], "failed", NO_ANSWER if busy else BROKE)


@jobs.handler(SEND, max_attempts=6, lease_seconds=60, timeout_seconds=60, backoff=(10, 600),
              on_failure=_failed)
async def send_email(payload: dict) -> None:
    """Make one queued email, send it with no database session held, and
    record how it went."""
    email_id = payload["email_id"]
    async with database.async_session() as db:
        email = await db.get(EmailOutbox, email_id)
        if email is None or email.status != "queued":
            return
        make = COMPOSERS.get(email.kind)
        if make is None:
            await _end(db, email_id, "failed", UNKNOWN)
            await db.commit()
            return
        composed = await make(db, email)
        if composed is None:
            await _end(db, email_id, "skipped")
        # What making it wrote, such as a code issued, is kept either way.
        await db.commit()
    if composed is None:
        return
    to_address, subject, html = composed
    outcome = await email_service.deliver(to_address, subject, html)
    if outcome == BUSY:
        raise EmailBusy("the email service is busy, slow or out of reach")
    async with database.async_session() as db:
        if outcome == SENT:
            await _end(db, email_id, "sent")
        else:
            await _end(db, email_id, "failed", NOT_SET_UP if outcome == OFF else REFUSED)
        await db.commit()
    logger.info("email %s %s", email_id, outcome)

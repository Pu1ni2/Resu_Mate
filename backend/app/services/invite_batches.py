"""Batch invitations: each candidate's interview, questions and email, made by
a background job, one job per candidate.

A batch invite, from the screening results or the assistant, did all of it
inside the request, one candidate after another: five people took minutes,
the browser gave up after two, and asking again made every interview again.
The request keeps the batch and an item per candidate
(app/models/invite_batch.py), and queues invite.prepare for each item.

Each step is kept as it's done, in the item's status (queued, questions,
drafting, then done), so a run that stops partway, at a restart or for a
retry, goes on from there: an interview is never made twice, nor an
invitation sent twice. No database session is held while the AI writes or
an email goes.
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.agents.hr_agent import hr_agent
from app.core import database
from app.core.config import settings
from app.core.errors import friendly_error
from app.models.auth import HiringManager
from app.models.candidate import Candidate, Interview
from app.models.invite_batch import InviteBatch, InviteBatchItem
from app.services import email_quota, interview_setup, jobs
from app.services.email_service import email_service
from app.services.hidden_names import hides_names
from app.services.resume_rag import is_sample, primary_email, resume_rag

logger = logging.getLogger("resumate.invite_batches")

PREPARE = "invite.prepare"

# An interview the candidate can still take. One of these for the same role
# is used again rather than made a second time.
OPEN = ("pending", "in_progress", "interrupted")

FINISHED = ("done", "skipped", "failed")

# The most a batch invites. The confirm dialog lists each one.
MAX_CANDIDATES = 100

NO_EMAIL = "No email address on this résumé, so they can't be invited."
NOT_FOUND = "They're no longer among your candidates."
INTERVIEW_FAILED = "The interview couldn't be created. Try again in a moment."
NOT_FINISHED = "The invitation couldn't be finished."
DRAFT_FAILED = "The email couldn't be drafted, so a standard one is here instead."
NOT_SET_UP = "Email isn't set up on this server. Share the portal link instead."
NOT_ACCEPTED = "The email service didn't accept this invite."
NO_INTERVIEW = "The interview was deleted, so no invitation went."
# A run stopped while it sent the email, at a restart say: whether it went
# can't be known, and sending it again could send it twice.
UNSURE = "It isn't known whether this invitation went: it was being sent when the server stopped, so it wasn't sent again."


def skip_reason(candidate: dict) -> Optional[str]:
    """Why this candidate gets no invitation, or None: no address to send it
    to, or the sample résumé."""
    if not primary_email(candidate):
        return NO_EMAIL
    if is_sample(candidate):
        return interview_setup.SAMPLE_NOT_INVITED
    return None


def job_key(item_id: int) -> str:
    return f"invite_item:{item_id}"


async def queue(db, item_id: int, manager_id: int) -> Optional[int]:
    """Queue an item's job in the caller's transaction, once: one queued or
    running for the item already is the one."""
    return await jobs.enqueue(db, PREPARE, {"item_id": item_id}, dedupe_key=job_key(item_id),
                              manager_id=manager_id)


async def find(db, manager_id: int, *, batch_id: Optional[int] = None,
               client_key: Optional[str] = None) -> Optional[InviteBatch]:
    """This manager's batch, by its id or its client_key; None for another's."""
    query = select(InviteBatch).where(InviteBatch.manager_id == manager_id)
    if batch_id is not None:
        query = query.where(InviteBatch.id == batch_id)
    else:
        query = query.where(InviteBatch.client_key == client_key)
    return (await db.execute(query)).scalar_one_or_none()


async def start(db, manager_id: int, *, client_key: str, candidate_ids: list, **fields) -> InviteBatch:
    """Keep a batch, an item per candidate, and each item's job, in one
    commit, and return it: the request answers at once, and the jobs do the
    rest. The batch already made with this client_key, one per Confirm on
    the page, is the one, whatever else this request says: a second click
    or a retry invites no one twice.

    candidate_ids name each candidate once. Those who can't be invited are
    marked so at once, with why: no longer this manager's, no address, or
    the sample résumé."""
    made = await find(db, manager_id, client_key=client_key)
    if made is not None:
        return made
    batch = InviteBatch(manager_id=manager_id, client_key=client_key, **fields)
    db.add(batch)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        # Another request with the same key made it meanwhile.
        made = await find(db, manager_id, client_key=client_key)
        if made is None:
            raise
        return made
    rows = {row.id: row for row in (await db.execute(select(Candidate).where(
        Candidate.id.in_(candidate_ids), Candidate.manager_id == manager_id))).scalars()}
    items = []
    for position, candidate_id in enumerate(candidate_ids):
        row = rows.get(candidate_id)
        reason = NOT_FOUND if row is None else skip_reason(resume_rag.record_from_row(row))
        items.append(InviteBatchItem(
            batch_id=batch.id, candidate_id=candidate_id, position=position,
            status="skipped" if reason else "queued", skip_reason=reason,
            finished_at=datetime.utcnow() if reason else None,
        ))
    db.add_all(items)
    await db.flush()
    for item in items:
        if item.status == "queued":
            await queue(db, item.id, manager_id)
    await db.commit()
    return batch


def _outcome(item, row, interview) -> dict:
    """One candidate's part of a batch, in the shape the batch invite
    answered with, and how far it got (status: queued, questions, drafting,
    then done, skipped or failed)."""
    candidate = resume_rag.record_from_row(row) if row is not None else None
    outcome = {
        "item_id": item.id, "candidate_id": item.candidate_id, "status": item.status,
        "reused": bool(item.reused), "name": (candidate or {}).get("name") or "",
        "email": interview.candidate_email if interview is not None else (primary_email(candidate) if candidate else ""),
        "interview_created": interview is not None,
        "interview_id": interview.id if interview is not None else None,
        "email_sent": item.email_status == "sent",
    }
    if interview is not None:
        outcome["mode"] = interview.mode
    if item.status == "skipped":
        outcome["skipped"] = item.skip_reason
    elif item.status == "failed":
        outcome["error"] = (NOT_FOUND if item.error == "candidate_not_found"
                            else NOT_FINISHED if interview is not None else INTERVIEW_FAILED)
    if item.email_subject is not None:
        outcome.update(email_subject=item.email_subject, email_body=item.email_body,
                       email_drafted=bool(item.email_drafted))
        if item.email_drafted is False:
            outcome["email_error"] = DRAFT_FAILED
    if item.email_status in ("refused", "failed"):
        outcome["email_send_error"] = item.email_error
    return outcome


async def view(db, batch: InviteBatch) -> dict:
    """The batch as its page follows it: each candidate's outcome, the
    totals, and whether every one has finished."""
    items = (await db.execute(select(InviteBatchItem).where(InviteBatchItem.batch_id == batch.id)
                              .order_by(InviteBatchItem.position))).scalars().all()
    rows = {row.id: row for row in (await db.execute(select(Candidate).where(
        Candidate.id.in_([item.candidate_id for item in items]),
        Candidate.manager_id == batch.manager_id))).scalars()}
    interviews = {interview.id: interview for interview in (await db.execute(select(Interview).where(
        Interview.id.in_([item.interview_id for item in items if item.interview_id]),
        Interview.manager_id == batch.manager_id))).scalars()}
    outcomes = [_outcome(item, rows.get(item.candidate_id), interviews.get(item.interview_id)) for item in items]
    return {
        "batch_id": batch.id,
        "finished": all(item.status in FINISHED for item in items),
        "total": len(outcomes),
        "interviews_created": sum(1 for o in outcomes if o["interview_created"]),
        "emails_sent": sum(1 for o in outcomes if o["email_sent"]),
        "skipped": sum(1 for o in outcomes if o.get("skipped")),
        "send_emails": batch.send_emails,
        # Where invited candidates sign in, for the manager to share when an
        # invitation wasn't emailed.
        "portal_link": settings.candidate_login_url,
        "outcomes": outcomes,
    }


def standard_draft(name: str, role: str, hidden: bool) -> tuple:
    """The invitation's subject and body without the AI, for when it couldn't
    write one: greeting them without the name while names are hidden, as
    the AI's drafts do."""
    greeting = "Hi there" if hidden else f"Dear {name}"
    return (f"Interview Invitation — {role}",
            f"{greeting},\n\n"
            f"We are pleased to invite you to interview for the {role} position.\n\n"
            f"Please log in to your candidate portal to access your interview.\n\n"
            f"Best regards,\nHiring Team")


async def _unfinished(db, item_id: int):
    """The item and its batch, or None when the item is gone (its candidate
    or the account deleted) or has finished."""
    item = await db.get(InviteBatchItem, item_id)
    if item is None or item.status in FINISHED:
        return None
    return item, await db.get(InviteBatch, item.batch_id)


async def _candidate(db, item, batch) -> Optional[dict]:
    """The item's candidate, as the candidate store holds them, read from the
    database: the job may run where the server's memory hasn't got them.
    None when they're gone, or not this manager's."""
    row = await db.get(Candidate, item.candidate_id)
    if row is None or row.manager_id != batch.manager_id:
        return None
    return resume_rag.record_from_row(row)


async def _make_interview(item_id: int) -> None:
    """The item's interview: an open one for the same role, used again, or a
    new one, with the candidate's portal access. The item records it in the
    same transaction, so a run again finds it made."""
    async with database.async_session() as db:
        found = await _unfinished(db, item_id)
        if found is None or found[0].status != "queued":
            return
        item, batch = found
        candidate = await _candidate(db, item, batch)
        if candidate is None:
            raise jobs.PermanentError("candidate_not_found")
        if reason := skip_reason(candidate):
            item.status, item.skip_reason, item.finished_at = "skipped", reason, datetime.utcnow()
            await db.commit()
            return
        open_one = (await db.execute(
            select(Interview).where(
                Interview.manager_id == batch.manager_id, Interview.candidate_id == item.candidate_id,
                Interview.role == (batch.role or "General"), Interview.status.in_(OPEN),
            ).order_by(Interview.id.desc()).limit(1)
        )).scalar_one_or_none()
        if open_one is not None:
            # Its questions are its own: the manager may have read or edited them.
            item.interview_id, item.reused, item.status = open_one.id, True, "drafting"
        else:
            interview = await interview_setup.add_interview(
                db, manager_id=batch.manager_id, candidate_id=item.candidate_id,
                email=primary_email(candidate), name=candidate.get("name") or "", role=batch.role,
                level=batch.level, num_questions=batch.num_questions, focus_areas=batch.focus_areas,
                mode=batch.mode,
            )
            item.interview_id, item.status = interview.id, "questions"
        await db.commit()


async def _write_questions(item_id: int) -> None:
    """The new interview's questions, for this candidate and role, written
    with no session held. Questions the manager set meanwhile are kept, and
    an interview the candidate has started is left as it is."""
    async with database.async_session() as db:
        found = await _unfinished(db, item_id)
        if found is None or found[0].status != "questions":
            return
        item, batch = found
        candidate = await _candidate(db, item, batch)
        interview = await db.get(Interview, item.interview_id)
        asked = None
        if candidate is not None and interview is not None:
            asked = (interview.role, interview.level, interview.num_questions, interview.focus_areas,
                     candidate.get("name") or "the candidate", candidate)
    written = await interview_setup.make_questions(*asked) if asked else ([], None)
    async with database.async_session() as db:
        found = await _unfinished(db, item_id)
        if found is None or found[0].status != "questions":
            return
        item, _ = found
        interview = await db.get(Interview, item.interview_id)
        if interview is not None and interview.status == "pending":
            questions, resume_intel = written
            interview_setup.keep_questions(interview, [] if interview.questions else questions, resume_intel)
        item.status = "drafting"
        await db.commit()


def _drafting(found) -> bool:
    return found is not None and found[0].status == "drafting" and found[0].email_subject is None


async def _write_draft(item_id: int) -> None:
    """The invitation's draft, for the manager to read or send, signed by
    them: the AI's, written with no session held and without the name
    while names are hidden, or the standard one when it couldn't write it."""
    async with database.async_session() as db:
        found = await _unfinished(db, item_id)
        if not _drafting(found):
            return
        item, batch = found
        candidate = await _candidate(db, item, batch)
        if candidate is None:
            raise jobs.PermanentError("candidate_not_found")
        manager = await db.get(HiringManager, batch.manager_id)
        hidden, sender = hides_names(manager), {"name": manager.name, "company": manager.company}
        role, level, email_type = batch.role, batch.level, batch.email_type
    try:
        drafted = await hr_agent.draft_email(
            candidate=candidate, email_type=email_type, evaluation_report=f"Role: {role} | Level: {level}",
            anonymize=hidden, sender=sender,
        )
        subject, body = drafted.get("subject") or f"Interview Invitation — {role}", drafted.get("body") or ""
        if not body.strip():
            raise ValueError("an empty draft")
        by_ai = True
    except Exception as e:
        logger.warning("invitation draft could not be written: %s", type(e).__name__)
        (subject, body), by_ai = standard_draft(candidate.get("name") or "Candidate", role, hidden), False
    async with database.async_session() as db:
        found = await _unfinished(db, item_id)
        if not _drafting(found):
            return
        item, batch = found
        item.email_subject, item.email_body, item.email_drafted = subject[:300], body, by_ai
        if not batch.send_emails:
            item.status, item.finished_at = "done", datetime.utcnow()
        await db.commit()


async def _send(item_id: int) -> None:
    """The invitation emailed, when the batch asked for that, once: the item
    is claimed (email_status "sending") before the email goes, so a run
    again never sends it a second time. One that finds it claimed, by a run
    that stopped meanwhile, can't tell whether it went, and says so."""
    async with database.async_session() as db:
        found = await _unfinished(db, item_id)
        if found is None or found[0].status != "drafting" or found[0].email_subject is None:
            return
        item, batch = found
        interview = await db.get(Interview, item.interview_id) if item.interview_id else None
        manager = await db.get(HiringManager, batch.manager_id)
        refused = None
        if item.email_status == "sending":
            refused = ("failed", UNSURE)
        elif interview is None:
            refused = ("failed", NO_INTERVIEW)
        elif not email_service.configured:
            refused = ("refused", NOT_SET_UP)
        elif reason := await email_quota.refusal(db, manager):
            refused = ("refused", reason)
        if refused:
            item.email_status, item.email_error = refused
            item.status, item.finished_at = "done", datetime.utcnow()
            await db.commit()
            return
        claimed = (await db.execute(update(InviteBatchItem).where(
            InviteBatchItem.id == item_id, InviteBatchItem.email_status.is_(None),
        ).values(email_status="sending"))).rowcount == 1
        candidate = await _candidate(db, item, batch)
        to, manager_id, role, company = interview.candidate_email, batch.manager_id, batch.role, manager.company
        await db.commit()
    if not claimed:
        return
    name = (candidate or {}).get("name") or "Candidate"
    try:
        sent = await email_service.send_interview_invitation(to, name, role, settings.candidate_login_url,
                                                             company=company or "")
        error = None if sent else NOT_ACCEPTED
    except Exception as e:
        logger.warning("batch invitation not sent: %s", type(e).__name__)
        sent, error = False, friendly_error(e, "The email couldn't be sent.")
    async with database.async_session() as db:
        await db.execute(update(InviteBatchItem).where(
            InviteBatchItem.id == item_id, InviteBatchItem.email_status == "sending",
        ).values(email_status="sent" if sent else "failed", email_error=error, status="done",
                 finished_at=datetime.utcnow()))
        if sent:
            # Counted against the day's emails even if the item went meanwhile.
            await email_quota.record_sent(db, manager_id, to, "interview invitation")
        await db.commit()


async def _prepare_failed(db, job, code) -> None:
    """The invitation couldn't be prepared, for good: its item says so, with
    a short code. What was done stays: an interview already made stands."""
    await db.execute(update(InviteBatchItem).where(
        InviteBatchItem.id == job.payload["item_id"], InviteBatchItem.status.not_in(FINISHED),
    ).values(status="failed", error=code, finished_at=datetime.utcnow()))


@jobs.handler(PREPARE, backoff=(30, 600), on_failure=_prepare_failed)
async def prepare_invite(payload: dict) -> None:
    """Prepare one candidate's invitation, an item of a batch, from wherever
    it got to: the interview, its questions, the draft, then the email when
    the batch asked for it."""
    item_id = payload["item_id"]
    await _make_interview(item_id)
    await _write_questions(item_id)
    await _write_draft(item_id)
    await _send(item_id)

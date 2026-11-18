"""Batch invitations: each candidate's interview, questions and email, made by
a background job, one job per candidate.

A batch invite, from the screening results or the assistant, did all of it
inside the request, one candidate after another: five people took minutes,
the browser gave up after two, and asking again made every interview again.
The request keeps the batch and an item per candidate
(app/models/invite_batch.py), and queues invite.prepare for each item.

Each step is kept as it's done, in the item's status (queued, questions,
drafting, then done), so a run that stops partway, at a restart or for a
retry, goes on from there, and an interview is never made twice. No database
session is held while the AI writes.
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update

from app.core import database
from app.models.candidate import Candidate, Interview
from app.models.invite_batch import InviteBatch, InviteBatchItem
from app.services import interview_setup, jobs
from app.services.resume_rag import is_sample, primary_email, resume_rag

logger = logging.getLogger("resumate.invite_batches")

PREPARE = "invite.prepare"

# An interview the candidate can still take. One of these for the same role
# is used again rather than made a second time.
OPEN = ("pending", "in_progress", "interrupted")

FINISHED = ("done", "skipped", "failed")

NO_EMAIL = "No email address on this résumé, so they can't be invited."


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


async def _prepare_failed(db, job, code) -> None:
    """The invitation couldn't be prepared, for good: its item says so, with
    a short code. What was done stays: an interview already made stands."""
    await db.execute(update(InviteBatchItem).where(
        InviteBatchItem.id == job.payload["item_id"], InviteBatchItem.status.not_in(FINISHED),
    ).values(status="failed", error=code, finished_at=datetime.utcnow()))


@jobs.handler(PREPARE, backoff=(30, 600), on_failure=_prepare_failed)
async def prepare_invite(payload: dict) -> None:
    """Prepare one candidate's invitation, an item of a batch, from wherever
    it got to: the interview, then its questions."""
    item_id = payload["item_id"]
    await _make_interview(item_id)
    await _write_questions(item_id)

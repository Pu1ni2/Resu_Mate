"""Batch invitations, each candidate's prepared by a background job
(app/services/invite_batches.py).

A batch invite made every candidate's interview, questions and email inside
the request, one after another: five people took minutes, the browser gave
up after two, and asking again made every interview again.
"""
import asyncio
import itertools
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from conftest import register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


_keys = itertools.count()


async def _candidate(manager_id, name="Ada", email="ada@x.com", **fields):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name=name, email=email, full_text=f"{name}\n{email}", **fields)
        db.add(cand)
        await db.commit()
        return cand.id


async def _interview(manager_id, candidate_id, role, status, **fields):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        interview = Interview(candidate_id=candidate_id, manager_id=manager_id, candidate_email="ada@x.com",
                              role=role, status=status, mode="conversational", **fields)
        db.add(interview)
        await db.commit()
        return interview.id


async def _queued(manager_id, candidate_ids, **fields):
    """A batch of these candidates with each item's job queued, as the
    request leaves them."""
    from app.core import database
    from app.models.invite_batch import InviteBatch, InviteBatchItem
    from app.services import invite_batches
    async with database.async_session() as db:
        batch = InviteBatch(**{"manager_id": manager_id, "source": "screening", "client_key": f"k{next(_keys)}",
                               "role": "Data Engineer", "level": "Senior", "num_questions": 3,
                               "focus_areas": ["SQL"], "mode": "conversational", **fields})
        db.add(batch)
        await db.flush()
        items = [InviteBatchItem(batch_id=batch.id, candidate_id=cid, position=i)
                 for i, cid in enumerate(candidate_ids)]
        db.add_all(items)
        await db.flush()
        for item in items:
            await invite_batches.queue(db, item.id, manager_id)
        await db.commit()
        return [item.id for item in items]


async def _item(item_id):
    from app.core import database
    from app.models.invite_batch import InviteBatchItem
    async with database.async_session() as db:
        item = await db.get(InviteBatchItem, item_id)
        return item and {"status": item.status, "interview_id": item.interview_id, "reused": item.reused,
                         "skip_reason": item.skip_reason, "error": item.error,
                         "finished": item.finished_at is not None}


async def _interviews(manager_id):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        rows = (await db.execute(select(Interview).where(Interview.manager_id == manager_id)
                                 .order_by(Interview.id))).scalars()
        return [{"id": i.id, "candidate_id": i.candidate_id, "email": i.candidate_email, "role": i.role,
                 "level": i.level, "num_questions": i.num_questions, "focus_areas": i.focus_areas,
                 "mode": i.mode, "status": i.status, "questions": i.questions, "room_config": i.room_config}
                for i in rows]


async def _grants(email, manager_id):
    from app.core import database
    from app.models.candidate import CandidateAccess
    async with database.async_session() as db:
        return (await db.execute(select(func.count()).select_from(CandidateAccess).where(
            CandidateAccess.email == email, CandidateAccess.manager_id == manager_id))).scalar()


async def _change_interview(manager_id, **values):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        for interview in (await db.execute(select(Interview).where(Interview.manager_id == manager_id))).scalars():
            for column, value in values.items():
                setattr(interview, column, value)
        await db.commit()


class _Calls(list):
    """What a stand-in was asked, call by call."""


@pytest.fixture()
def questions(monkeypatch):
    """The question writer without the AI. Each call records what it was asked
    and how many database connections were held meanwhile; questions.stub.during,
    when set, runs while it writes."""
    from app.agents.technical_agent import technical_agent
    from app.core import database
    calls = _Calls()

    async def generate_smart_questions(role, level, num_questions, focus_areas, name, candidate):
        calls.append({"held": database.engine.sync_engine.pool.checkedout(), "role": role, "level": level,
                      "num_questions": num_questions, "focus_areas": focus_areas, "name": name})
        if generate_smart_questions.during:
            await generate_smart_questions.during()
        return {"questions": [f"Question {i + 1}?" for i in range(num_questions)],
                "resume_intelligence": {"claims": ["SQL"]}}
    generate_smart_questions.during = None
    monkeypatch.setattr(technical_agent, "generate_smart_questions", generate_smart_questions)
    calls.stub = generate_smart_questions
    return calls


@pytest.fixture(autouse=True)
def drafts(monkeypatch):
    """The HR agent's drafts without the AI. Each call records its arguments
    and the database connections held meanwhile; drafts.stub.answer, when
    set, is what it does instead."""
    from app.agents.hr_agent import hr_agent
    from app.core import database
    calls = _Calls()

    async def draft_email(**arguments):
        calls.append({"held": database.engine.sync_engine.pool.checkedout(), **arguments})
        if draft_email.answer:
            return await draft_email.answer()
        return {"subject": "Interview", "body": "Hello"}
    draft_email.answer = None
    monkeypatch.setattr(hr_agent, "draft_email", draft_email)
    calls.stub = draft_email
    return calls


@pytest.fixture()
def mailbox(monkeypatch):
    """A server with email set up, delivering into a list, each email with the
    database connections held while it went; mailbox.stub.answer, when set,
    is what the email service does instead."""
    from app.core import database
    from app.services.email_service import email_service
    sent = _Calls()

    async def deliver(to_email, subject, html_body):
        sent.append({"to": to_email, "subject": subject, "html": html_body,
                     "held": database.engine.sync_engine.pool.checkedout()})
        return deliver.answer() if deliver.answer else "sent"
    deliver.answer = None
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "deliver", deliver)
    sent.stub = deliver
    return sent


# ── the interview and its questions ───────────────────────────────────────────

def test_the_server_registers_the_invitation_job():
    import main  # noqa: F401
    from app.services import jobs
    assert jobs.handler_for("invite.prepare").on_failure is not None


def test_an_item_gets_its_interview_and_questions_with_no_connection_held(client, run_jobs, questions):
    _, m = register(client, "ij1@co.com")
    cid = _run(_candidate(m["id"], email="Ada@X.com"))
    [item] = _run(_queued(m["id"], [cid]))
    assert run_jobs() == ["done"]
    [interview] = _run(_interviews(m["id"]))
    assert interview == {
        "id": interview["id"], "candidate_id": cid, "email": "ada@x.com", "role": "Data Engineer",
        "level": "Senior", "num_questions": 3, "focus_areas": ["SQL"], "mode": "conversational",
        "status": "pending", "questions": ["Question 1?", "Question 2?", "Question 3?"],
        "room_config": {"resume_intelligence": {"claims": ["SQL"]}},
    }
    state = _run(_item(item))
    assert (state["interview_id"], state["reused"], state["error"]) == (interview["id"], False, None)
    assert questions == [{"held": 0, "role": "Data Engineer", "level": "Senior", "num_questions": 3,
                          "focus_areas": ["SQL"], "name": "Ada"}]
    # The portal lets them in to take it.
    assert _run(_grants("ada@x.com", m["id"])) == 1


def test_an_open_interview_for_the_same_role_is_used_again(client, run_jobs, questions):
    _, m = register(client, "ij2@co.com")
    cid = _run(_candidate(m["id"]))
    # A finished one, and one open for another role, aren't this invitation's.
    _run(_interview(m["id"], cid, "Data Engineer", "completed"))
    _run(_interview(m["id"], cid, "Analyst", "pending"))
    [first] = _run(_queued(m["id"], [cid]))
    run_jobs()
    made = _run(_item(first))
    assert made["reused"] is False
    # Asked again, from another batch, while that one is open: it's the one.
    [again] = _run(_queued(m["id"], [cid]))
    run_jobs()
    state = _run(_item(again))
    assert (state["interview_id"], state["reused"]) == (made["interview_id"], True)
    assert len(_run(_interviews(m["id"]))) == 3
    # Only the new one's questions were written.
    assert len(questions) == 1


@pytest.mark.parametrize("status", ["pending", "in_progress", "interrupted"])
def test_an_interview_the_candidate_can_still_take_keeps_its_questions(client, run_jobs, questions, status):
    _, m = register(client, f"ij3-{status.replace('_', '')}@co.com")
    cid = _run(_candidate(m["id"]))
    open_one = _run(_interview(m["id"], cid, "Data Engineer", status, questions=["Mine?"]))
    [item] = _run(_queued(m["id"], [cid]))
    assert run_jobs() == ["done"]
    state = _run(_item(item))
    assert (state["interview_id"], state["reused"]) == (open_one, True)
    [interview] = _run(_interviews(m["id"]))
    assert interview["questions"] == ["Mine?"]
    assert questions == []


def test_questions_the_manager_set_meanwhile_are_kept(client, run_jobs, questions):
    # The interview is on the manager's page, questions and all, once made.
    _, m = register(client, "ij4@co.com")
    cid = _run(_candidate(m["id"]))
    _run(_queued(m["id"], [cid]))

    async def edited():
        await _change_interview(m["id"], questions=["The manager's?"])
    questions.stub.during = edited
    assert run_jobs() == ["done"]
    [interview] = _run(_interviews(m["id"]))
    assert interview["questions"] == ["The manager's?"]
    # What the résumé says to check is kept still.
    assert interview["room_config"] == {"resume_intelligence": {"claims": ["SQL"]}}


def test_an_interview_started_meanwhile_is_left_as_it_is(client, run_jobs, questions):
    _, m = register(client, "ij5@co.com")
    cid = _run(_candidate(m["id"]))
    _run(_queued(m["id"], [cid]))

    async def started():
        await _change_interview(m["id"], status="in_progress")
    questions.stub.during = started
    assert run_jobs() == ["done"]
    [interview] = _run(_interviews(m["id"]))
    assert (interview["questions"], interview["room_config"]) == ([], None)


def test_a_run_that_stopped_after_the_interview_was_made_goes_on_from_there(client, run_jobs, questions,
                                                                           monkeypatch):
    from app.services import invite_batches
    _, m = register(client, "ij6@co.com")
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid]))
    real, stopped = invite_batches._write_questions, []

    async def stops_once(item_id):
        if not stopped:
            stopped.append(item_id)
            raise OperationalError("UPDATE", {}, Exception("database is locked"))
        await real(item_id)
    monkeypatch.setattr(invite_batches, "_write_questions", stops_once)
    assert run_jobs() == ["retry"]
    assert _run(_item(item))["status"] == "questions"
    assert run_jobs(now=datetime.utcnow() + timedelta(minutes=15)) == ["done"]
    [interview] = _run(_interviews(m["id"]))
    assert interview["questions"] == ["Question 1?", "Question 2?", "Question 3?"]
    assert _run(_grants("ada@x.com", m["id"])) == 1


def test_a_candidate_who_isnt_there_fails_with_a_code(client, run_jobs, questions):
    _, m = register(client, "ij7@co.com")
    _, other = register(client, "ij7b@co.com")
    theirs = _run(_candidate(other["id"]))
    # One with no row, and another manager's.
    items = _run(_queued(m["id"], [99999, theirs]))
    assert run_jobs() == ["failed", "failed"]
    for item in items:
        state = _run(_item(item))
        assert (state["status"], state["error"], state["interview_id"], state["finished"]) == \
            ("failed", "candidate_not_found", None, True)
    assert _run(_interviews(m["id"])) == [] and questions == []


def test_no_address_or_the_sample_resume_is_skipped(client, run_jobs, questions):
    from app.services import interview_setup, invite_batches
    from app.services.resume_rag import SAMPLE_RESUME_SHA256
    _, m = register(client, "ij8@co.com")
    no_address = _run(_candidate(m["id"], name="Bo", email=""))
    sample = _run(_candidate(m["id"], name="Sam", email="sam@x.com", file_hash=SAMPLE_RESUME_SHA256))
    items = _run(_queued(m["id"], [no_address, sample]))
    assert run_jobs() == ["done", "done"]
    assert [(_run(_item(i))["status"], _run(_item(i))["skip_reason"], _run(_item(i))["finished"]) for i in items] == [
        ("skipped", invite_batches.NO_EMAIL, True), ("skipped", interview_setup.SAMPLE_NOT_INVITED, True)]
    assert _run(_interviews(m["id"])) == [] and questions == []


def test_an_item_deleted_before_its_job_runs_is_left_alone(client, run_jobs, questions):
    from app.core import database
    from app.models.invite_batch import InviteBatchItem
    _, m = register(client, "ij9@co.com")
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid]))

    async def delete():
        async with database.async_session() as db:
            await db.delete(await db.get(InviteBatchItem, item))
            await db.commit()
    _run(delete())
    assert run_jobs() == ["done"]
    assert _run(_interviews(m["id"])) == [] and questions == []


# ── the draft, and the email ──────────────────────────────────────────────────

async def _manager(manager_id, **values):
    from app.core import database
    from app.models.auth import HiringManager
    async with database.async_session() as db:
        manager = await db.get(HiringManager, manager_id)
        for column, value in values.items():
            setattr(manager, column, value)
        await db.commit()


async def _email(item_id):
    from app.core import database
    from app.models.invite_batch import InviteBatchItem
    async with database.async_session() as db:
        item = await db.get(InviteBatchItem, item_id)
        return {"subject": item.email_subject, "body": item.email_body, "drafted": item.email_drafted,
                "status": item.email_status, "error": item.email_error, "item": item.status,
                "email_id": item.email_id}


async def _outbox(manager_id):
    """This manager's emails in the outbox, as they stand."""
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        rows = (await db.execute(select(EmailOutbox).where(EmailOutbox.manager_id == manager_id)
                                 .order_by(EmailOutbox.id))).scalars()
        return [{"id": e.id, "kind": e.kind, "interview": e.interview_id, "counts": e.counts_to_quota,
                 "key": e.dedupe_key, "status": e.status, "error": e.error} for e in rows]


async def _requeue(item_id, manager_id):
    from app.core import database
    from app.services import invite_batches
    async with database.async_session() as db:
        await invite_batches.queue(db, item_id, manager_id)
        await db.commit()


async def _sent_today(manager_id):
    from app.core import database
    from app.services import email_quota
    async with database.async_session() as db:
        return await email_quota.sent_today(db, manager_id)


def test_the_draft_is_signed_by_the_manager_and_written_with_no_connection_held(client, run_jobs, questions,
                                                                              drafts, mailbox):
    _, m = register(client, "ij10@co.com", name="Grace")
    _run(_manager(m["id"], company="Acme", hide_names=True))
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid], email_type="interest"))
    assert run_jobs() == ["done"]
    [call] = drafts
    assert (call["held"], call["email_type"], call["evaluation_report"], call["anonymize"], call["sender"]) == \
        (0, "interest", "Role: Data Engineer | Level: Senior", True, {"name": "Grace", "company": "Acme"})
    assert call["candidate"]["id"] == cid
    # Not asked to send: the draft waits for the manager, and nothing went.
    assert _run(_email(item)) == {"subject": "Interview", "body": "Hello", "drafted": True, "status": None,
                                  "error": None, "item": "done", "email_id": None}
    assert mailbox == [] and _run(_outbox(m["id"])) == []


@pytest.mark.parametrize("hidden, greeting, answer", [
    (False, "Dear Ada,", "busy"), (True, "Hi there,", "busy"), (False, "Dear Ada,", "empty")])
def test_a_draft_the_ai_couldnt_write_is_the_standard_one(client, run_jobs, questions, drafts, hidden, greeting,
                                                          answer):
    _, m = register(client, f"ij11-{int(hidden)}-{answer}@co.com")
    _run(_manager(m["id"], hide_names=hidden))
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid]))

    async def badly():
        if answer == "busy":
            raise RuntimeError("the AI is busy")
        return {"subject": "", "body": "  "}
    drafts.stub.answer = badly
    assert run_jobs() == ["done"]
    email = _run(_email(item))
    assert (email["subject"], email["drafted"], email["item"]) == ("Interview Invitation — Data Engineer", False, "done")
    assert email["body"].startswith(greeting)
    # Not the name while names are hidden.
    assert ("Ada" in email["body"]) is not hidden


def test_the_invitation_is_queued_as_its_item_ends_and_goes_once(client, run_jobs, questions, drafts, mailbox):
    from app.services import invite_batches
    _, m = register(client, "ij12@co.com")
    _run(_manager(m["id"], company="Acme"))
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid], send_emails=True))
    _run(invite_batches.prepare_invite({"item_id": item}))
    # Queued as the item ended, its place in the day's limit taken at once:
    # the outbox's job sends it.
    email = _run(_email(item))
    assert (email["status"], email["error"], email["item"]) == ("queued", None, "done")
    [interview] = _run(_interviews(m["id"]))
    assert _run(_outbox(m["id"])) == [{
        "id": email["email_id"], "kind": "interview_invitation", "interview": interview["id"], "counts": True,
        "key": f"invite:{interview['id']}", "status": "queued", "error": None}]
    assert mailbox == [] and _run(_sent_today(m["id"])) == 1
    # Its job, already done, then the email's.
    assert run_jobs() == ["done", "done"]
    assert [(mail["to"], mail["subject"], mail["held"]) for mail in mailbox] == [
        ("ada@x.com", "Interview invitation from Acme: Data Engineer", 0)]
    assert "Hi Ada," in mailbox[0]["html"]
    assert [e["status"] for e in _run(_outbox(m["id"]))] == ["sent"]
    assert _run(_sent_today(m["id"])) == 1
    # Its job queued again, as a retry would, queues nothing more and writes nothing again.
    _run(_requeue(item, m["id"]))
    assert run_jobs() == ["done"]
    assert (len(mailbox), len(drafts), len(questions), len(_run(_outbox(m["id"])))) == (1, 0, 1, 1)


def test_the_items_end_and_its_invitation_are_kept_together_or_not_at_all(client, run_jobs, questions, mailbox):
    # Queued apart, an invitation could go while its item said it had failed.
    import sqlite3
    from conftest import _TMP_DB
    _, m = register(client, "ij13@co.com")
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid], send_emails=True))
    # The database refuses to record the item's email as queued.
    db = sqlite3.connect(_TMP_DB)
    db.execute("CREATE TRIGGER refuse_queued AFTER UPDATE OF email_status ON invite_batch_items "
               "WHEN NEW.email_status = 'queued' BEGIN SELECT RAISE(ABORT, 'refused'); END")
    db.commit()
    db.close()
    assert run_jobs() == ["failed"]
    assert mailbox == [] and _run(_outbox(m["id"])) == [] and _run(_sent_today(m["id"])) == 0
    state = _run(_item(item))
    assert (state["status"], state["error"]) == ("failed", "error:IntegrityError")


def test_a_run_at_the_same_time_neither_queues_again_nor_says_otherwise(client, run_jobs, questions, mailbox,
                                                                        monkeypatch):
    # Two runs of one job at once: one whose hold on the job ran out while it
    # was still going, and the one that took the job up. Only the one that
    # ends the item queues its invitation, and what that one says stands.
    from app.services import invite_batches
    _, m = register(client, "ij17@co.com")
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid], send_emails=True))
    real, other, ready = invite_batches._unfinished, [], []
    real_draft = invite_batches._write_draft

    async def drafted(item_id):
        await real_draft(item_id)
        ready.append(item_id)

    async def the_other_run_first(db, item_id):
        found = await real(db, item_id)
        if found is not None and ready and not other:
            # This run has read the item, ready to send; the other ends it first.
            other.append(item_id)
            await invite_batches._send(item_id)
        return found
    monkeypatch.setattr(invite_batches, "_write_draft", drafted)
    monkeypatch.setattr(invite_batches, "_unfinished", the_other_run_first)
    assert run_jobs() == ["done", "done"]
    assert other == [item] and len(mailbox) == 1
    email = _run(_email(item))
    assert (email["status"], email["error"], email["item"]) == ("queued", None, "done")
    assert [(e["id"], e["status"]) for e in _run(_outbox(m["id"]))] == [(email["email_id"], "sent")]
    assert _run(_sent_today(m["id"])) == 1


def test_an_interview_invited_already_gets_no_second_invitation(client, run_jobs, questions, drafts, mailbox):
    # An open interview for the role is used again: invited from its own
    # page already, it isn't invited twice.
    from app.core import database
    from app.services import email_kinds, outbox
    _, m = register(client, "ij18@co.com")
    cid = _run(_candidate(m["id"]))
    iid = _run(_interview(m["id"], cid, "Data Engineer", "pending"))

    async def invited():
        async with database.async_session() as db:
            await outbox.queue(db, "interview_invitation", manager_id=m["id"], interview_id=iid,
                               counts_to_quota=True, dedupe_key=f"invite:{iid}")
            await db.commit()
    _run(invited())
    [item] = _run(_queued(m["id"], [cid], send_emails=True))
    assert run_jobs() == ["done", "done"]
    assert len(mailbox) == 1
    email = _run(_email(item))
    assert (email["status"], email["error"], email["item"], email["email_id"]) == (
        "refused", email_kinds.ALREADY_INVITED, "done", None)
    assert len(_run(_outbox(m["id"]))) == 1 and _run(_sent_today(m["id"])) == 1


@pytest.mark.parametrize("why", ["unconfirmed", "limit", "no_email"])
def test_an_invitation_that_may_not_go_says_why(client, run_jobs, questions, mailbox, monkeypatch, why):
    from app.core.config import settings
    from app.services import email_quota, invite_batches
    from app.services.email_service import email_service
    _, m = register(client, f"ij14-{why.replace('_', '')}@co.com", verified=why != "unconfirmed")
    if why == "limit":
        monkeypatch.setattr(settings, "daily_email_limit", 0)
    if why == "no_email":
        monkeypatch.setattr(email_service, "_sg", None)
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid], send_emails=True))
    # An unconfirmed account's own confirmation email goes too.
    assert run_jobs() == ["done"] * (2 if why == "unconfirmed" else 1)
    said = {"unconfirmed": email_quota.NOT_CONFIRMED, "limit": email_quota.limit_reached(),
            "no_email": invite_batches.NOT_SET_UP}[why]
    email = _run(_email(item))
    assert (email["status"], email["error"], email["item"], email["email_id"]) == ("refused", said, "done", None)
    # (The unconfirmed account had its link to confirm, by the outbox.)
    assert [mail for mail in mailbox if mail["to"] == "ada@x.com"] == []
    assert [e for e in _run(_outbox(m["id"])) if e["kind"] == "interview_invitation"] == []
    # The interview stands: the manager can share the portal link. No draft:
    # the standard invitation was to go.
    assert email["subject"] is None and len(_run(_interviews(m["id"]))) == 1


def test_an_invitation_the_email_service_refuses_counts_for_nothing(client, run_jobs, questions, mailbox):
    from app.services import outbox
    _, m = register(client, "ij15@co.com")
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid], send_emails=True))
    mailbox.stub.answer = lambda: "refused"
    assert run_jobs() == ["done", "done"]
    email = _run(_email(item))
    assert (email["status"], email["error"], email["item"]) == ("queued", None, "done")
    # The outbox says how it went, and why.
    assert [(e["id"], e["status"], e["error"]) for e in _run(_outbox(m["id"]))] == [
        (email["email_id"], "failed", outbox.REFUSED)]
    assert len(mailbox) == 1 and _run(_sent_today(m["id"])) == 0


def test_an_interview_deleted_before_its_invitation_goes_gets_none(client, run_jobs, questions, mailbox,
                                                                   monkeypatch):
    from app.core import database
    from app.models.candidate import Interview
    from app.services import invite_batches
    _, m = register(client, "ij16@co.com")
    cid = _run(_candidate(m["id"]))
    [item] = _run(_queued(m["id"], [cid], send_emails=True))

    real_draft = invite_batches._write_draft

    async def deleted_meanwhile(item_id):
        await real_draft(item_id)
        async with database.async_session() as db:
            for interview in (await db.execute(select(Interview))).scalars():
                await db.delete(interview)
            await db.commit()
    monkeypatch.setattr(invite_batches, "_write_draft", deleted_meanwhile)
    assert run_jobs() == ["done"]
    assert mailbox == [] and _run(_outbox(m["id"])) == []
    email = _run(_email(item))
    assert (email["status"], email["error"], email["item"]) == ("failed", invite_batches.NO_INTERVIEW, "done")

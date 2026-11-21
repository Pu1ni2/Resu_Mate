"""A single interview's questions, written by a background job.

The interview was made with its questions inside the request: the AI wrote
them while the manager waited, and the invitation went before they were
kept.
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _interview(manager_id, email="ada@x.com", candidate_fields=None, **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Ada", email=email, full_text="Ada\nData engineer",
                         **(candidate_fields or {}))
        db.add(cand)
        await db.flush()
        interview = Interview(**{"candidate_id": cand.id, "manager_id": manager_id, "candidate_email": email,
                                 "role": "Dev", "mode": "conversational", **fields})
        db.add(interview)
        await db.commit()
        return interview.id


# ── how they stand ───────────────────────────────────────────────────────────

def test_an_interview_says_how_its_questions_stand(client):
    token, m = register(client, "qj1@co.com")
    made_with_them = _run(_interview(m["id"], questions=["Why this role?"]))
    being_written = _run(_interview(m["id"], questions_status="pending"))
    not_written = _run(_interview(m["id"], questions_status="failed"))

    def said(interview_id):
        r = client.get(f"/api/chat/interviews/{interview_id}", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        return r.json()["questions_status"], r.json()["questions"]
    assert said(made_with_them) == ("ready", ["Why this role?"])
    assert said(being_written) == ("pending", [])
    assert said(not_written) == ("failed", [])


# ── the job that writes them ─────────────────────────────────────────────────

class _Calls(list):
    """What the question writer was asked, call by call, with the database
    connections held meanwhile; `during`, when set, runs while it writes,
    and `questions` is what it writes."""
    during = None
    questions = ("Why data?", "How do you test a pipeline?")


@pytest.fixture()
def writer(monkeypatch):
    from app.agents.technical_agent import technical_agent
    from app.core import database
    calls = _Calls()

    async def generate_smart_questions(role, level, num_questions, focus_areas, name, candidate):
        calls.append({"held": database.engine.sync_engine.pool.checkedout(), "role": role, "level": level,
                      "num_questions": num_questions, "name": name, "candidate_id": candidate.get("id")})
        if calls.during:
            await calls.during()
        return {"questions": list(calls.questions), "resume_intelligence": {"claims": ["SQL"]}}
    monkeypatch.setattr(technical_agent, "generate_smart_questions", generate_smart_questions)
    return calls


async def _waiting(manager_id, **fields):
    """An interview whose questions are to be written, its job queued, as
    making one leaves it."""
    from app.core import database
    from app.models.candidate import Interview
    from app.services import interview_setup
    interview_id = await _interview(manager_id, level="Senior", num_questions=2, **fields)
    async with database.async_session() as db:
        interview = await db.get(Interview, interview_id)
        await interview_setup.queue_questions(db, interview)
        await db.commit()
    return interview_id


async def _held_invitation(manager_id, interview_id):
    from app.core import database
    from app.services import email_kinds, outbox
    async with database.async_session() as db:
        email_id = await outbox.queue(db, "interview_invitation", manager_id=manager_id, interview_id=interview_id,
                                      counts_to_quota=True, dedupe_key=email_kinds.invite_key(interview_id), held=True)
        await db.commit()
        return email_id


async def _read(interview_id):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        i = await db.get(Interview, interview_id)
        return {"status": i.questions_status, "questions": i.questions, "room_config": i.room_config}


async def _email(email_id):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        return (await db.get(EmailOutbox, email_id)).status


async def _change(interview_id, **values):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        interview = await db.get(Interview, interview_id)
        for column, value in values.items():
            setattr(interview, column, value)
        await db.commit()


@pytest.fixture()
def mailbox(monkeypatch):
    """A server with email set up, delivering into a list."""
    from app.services.email_service import email_service
    sent = []

    async def deliver(to_email, subject, html_body):
        sent.append(to_email)
        return "sent"
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "deliver", deliver)
    return sent


def test_the_server_registers_the_question_writer():
    import main  # noqa: F401
    from app.services import jobs
    handler = jobs.handler_for("interview.questions")
    assert (handler.lane, handler.max_attempts, handler.on_failure is not None) == ("work", 3, True)


def test_they_are_written_for_the_candidate_and_role_with_no_connection_held(client, run_jobs, writer):
    _, m = register(client, "qj2@co.com")
    iid = _run(_waiting(m["id"]))
    assert _run(_read(iid))["status"] == "pending"
    assert run_jobs() == ["done"]
    [call] = writer
    assert (call["held"], call["role"], call["level"], call["num_questions"], call["name"]) == (
        0, "Dev", "Senior", 2, "Ada")
    assert _run(_read(iid)) == {"status": "ready", "questions": ["Why data?", "How do you test a pipeline?"],
                                "room_config": {"resume_intelligence": {"claims": ["SQL"]}}}


def test_the_managers_own_set_meanwhile_are_kept(client, run_jobs, writer):
    _, m = register(client, "qj3@co.com")
    iid = _run(_waiting(m["id"]))

    async def edited():
        await _change(iid, questions=["The manager's?"])
    writer.during = edited
    assert run_jobs() == ["done"]
    read = _run(_read(iid))
    assert (read["status"], read["questions"]) == ("ready", ["The manager's?"])


def test_an_interview_started_meanwhile_is_left_as_it_is(client, run_jobs, writer):
    _, m = register(client, "qj4@co.com")
    iid = _run(_waiting(m["id"]))

    async def started():
        await _change(iid, status="in_progress")
    writer.during = started
    assert run_jobs() == ["done"]
    read = _run(_read(iid))
    assert (read["questions"] or [], read["room_config"]) == ([], None)


def test_they_wait_while_the_resume_is_being_read(client, run_jobs, writer):
    _, m = register(client, "qj5@co.com")
    iid = _run(_waiting(m["id"], candidate_fields={"analysis_status": "pending"}))
    assert run_jobs() == ["deferred"]
    assert writer == [] and _run(_read(iid))["status"] == "pending"


def test_its_held_invitation_goes_once_they_are_written(client, run_jobs, writer, mailbox):
    from app.core import database
    from app.services import email_quota
    _, m = register(client, "qj6@co.com")
    iid = _run(_waiting(m["id"]))
    email_id = _run(_held_invitation(m["id"], iid))
    # Held, it waits for them, and its place in the day's limit is taken.
    assert _run(_email(email_id)) == "held"

    async def counted():
        async with database.async_session() as db:
            return await email_quota.sent_today(db, m["id"])
    assert _run(counted()) == 1
    # The questions, then the invitation.
    assert run_jobs() == ["done", "done"]
    assert _run(_email(email_id)) == "sent" and mailbox == ["ada@x.com"]


def test_none_written_is_tried_again_then_the_interviewer_asks_its_own(client, run_jobs, writer, mailbox):
    _, m = register(client, "qj7@co.com")
    iid = _run(_waiting(m["id"]))
    email_id = _run(_held_invitation(m["id"], iid))
    writer.questions = ()
    soon = datetime.utcnow()
    assert run_jobs() == ["retry"]
    assert _run(_email(email_id)) == "held"
    assert run_jobs(now=soon + timedelta(minutes=15)) == ["retry"]
    # The last try fails; the invitation goes all the same.
    assert run_jobs(now=soon + timedelta(minutes=30)) == ["failed", "done"]
    assert _run(_read(iid))["status"] == "failed"
    assert _run(_email(email_id)) == "sent" and mailbox == ["ada@x.com"]


def test_ones_the_manager_set_while_they_were_tried_again_stand(client, run_jobs, writer):
    _, m = register(client, "qj8@co.com")
    iid = _run(_waiting(m["id"]))
    writer.questions = ()
    soon = datetime.utcnow()
    assert run_jobs() == ["retry"]
    # The manager writes them meanwhile (PUT .../questions), so they're ready.
    _run(_change(iid, questions=["The manager's?"], questions_status="ready"))
    assert run_jobs(now=soon + timedelta(minutes=15)) == ["done"]
    read = _run(_read(iid))
    assert (read["status"], read["questions"]) == ("ready", ["The manager's?"])
    assert len(writer) == 1


def test_a_failure_after_the_manager_set_them_leaves_theirs(client, run_jobs, writer):
    _, m = register(client, "qj11@co.com")
    iid = _run(_waiting(m["id"]))
    writer.questions = ()

    async def set_on_the_last_try():
        if len(writer) == 3:
            await _change(iid, questions=["The manager's?"], questions_status="ready")
    writer.during = set_on_the_last_try
    soon = datetime.utcnow()
    assert run_jobs() + run_jobs(now=soon + timedelta(minutes=15)) + run_jobs(now=soon + timedelta(minutes=30)) == [
        "retry", "retry", "failed"]
    read = _run(_read(iid))
    assert (read["status"], read["questions"]) == ("ready", ["The manager's?"])


def test_an_interview_deleted_while_they_are_written_keeps_nothing(client, run_jobs, writer):
    from app.core import database
    from app.models.candidate import Interview
    _, m = register(client, "qj12@co.com")
    iid = _run(_waiting(m["id"]))

    async def deleted():
        async with database.async_session() as db:
            await db.delete(await db.get(Interview, iid))
            await db.commit()
    writer.during = deleted
    assert run_jobs() == ["done"]


def test_an_interview_deleted_first_is_left_alone(client, run_jobs, writer):
    from app.core import database
    from app.models.candidate import Interview
    _, m = register(client, "qj9@co.com")
    iid = _run(_waiting(m["id"]))

    async def deleted():
        async with database.async_session() as db:
            await db.delete(await db.get(Interview, iid))
            await db.commit()
    _run(deleted())
    assert run_jobs() == ["done"] and writer == []


def test_a_held_email_waits_with_no_job_until_released(client, run_jobs, mailbox):
    from app.core import database
    from app.models.job import Job
    from app.services import outbox
    _, m = register(client, "qj10@co.com")
    iid = _run(_interview(m["id"]))
    email_id = _run(_held_invitation(m["id"], iid))
    other = _run(_interview(m["id"], email="bea@x.com"))
    others = _run(_held_invitation(m["id"], other))

    async def sent_already():
        # The interview's email that went before, as a reviewed draft.
        from app.models.email_outbox import EmailOutbox
        async with database.async_session() as db:
            db.add(EmailOutbox(kind="invitation_draft", manager_id=m["id"], interview_id=iid, status="sent"))
            await db.commit()
    _run(sent_already())

    async def jobs_for_them():
        async with database.async_session() as db:
            return [j.payload for j in (await db.execute(select(Job).where(Job.kind == "email.send"))).scalars()]
    assert _run(jobs_for_them()) == [] and run_jobs() == [] and mailbox == []

    async def released():
        async with database.async_session() as db:
            count = await outbox.release(db, iid)
            await db.commit()
            return count
    assert _run(released()) == 1
    assert run_jobs() == ["done"] and mailbox == ["ada@x.com"]
    # Another interview's stays held.
    assert (_run(_email(email_id)), _run(_email(others))) == ("sent", "held")


# ── the manager's own ────────────────────────────────────────────────────────

def test_the_managers_questions_are_ready_and_send_the_held_invitation(client, run_jobs, writer, mailbox):
    token, m = register(client, "qj13@co.com")
    iid = _run(_waiting(m["id"]))
    email_id = _run(_held_invitation(m["id"], iid))
    r = client.put(f"/api/chat/interviews/{iid}/questions", headers=auth_headers(token),
                   json={"questions": ["Tell me about a hard bug."]})
    assert r.status_code == 200, r.text
    assert r.json()["questions_status"] == "ready"
    assert _run(_read(iid))["status"] == "ready"
    # The job, running after, leaves theirs, and the invitation goes.
    assert run_jobs() == ["done", "done"]
    assert writer == [] and _run(_read(iid))["questions"] == ["Tell me about a hard bug."]
    assert _run(_email(email_id)) == "sent" and mailbox == ["ada@x.com"]

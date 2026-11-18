"""Emails sent by a background job, email.send (app/services/outbox.py), and
how a delivery went (app/services/email_service.py, deliver).

Eight places sent email, each its own way, and none tried again when the
email service was busy: such an email was lost, often with no one told.
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from conftest import register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _Calls(list):
    """What a stand-in was asked, call by call."""


@pytest.fixture()
def service(monkeypatch):
    """The email service without SendGrid: each delivery recorded, with the
    database connections held meanwhile, answered by service.stub.answers
    in turn (the last again once they run out)."""
    from app.core import database
    from app.services import email_service as module
    calls = _Calls()

    async def deliver(to_email, subject, html_body):
        calls.append({"to": to_email, "subject": subject, "html": html_body,
                      "held": database.engine.sync_engine.pool.checkedout()})
        answers = deliver.answers
        return answers[min(len(calls), len(answers)) - 1]
    deliver.answers = [module.SENT]
    monkeypatch.setattr(module.email_service, "deliver", deliver)
    calls.stub = deliver
    return calls


@pytest.fixture()
def done_email(monkeypatch):
    """What the "interview finished" email says, for these tests: to the
    manager, or nothing to send when done_email.nothing is set."""
    from app.services import outbox

    async def make(db, email):
        if make.nothing:
            return None
        return "mgr@co.com", "Interview finished", "<p>Read the report.</p>"
    make.nothing = False
    monkeypatch.setitem(outbox.COMPOSERS, "interview_done", make)
    return make


async def _queue(kind="interview_done", **fields):
    from app.core import database
    from app.services import outbox
    async with database.async_session() as db:
        email_id = await outbox.queue(db, kind, **fields)
        await db.commit()
        return email_id


async def _email(email_id):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        email = await db.get(EmailOutbox, email_id)
        return email and {"status": email.status, "error": email.error, "to": email.to_address,
                          "subject": email.subject, "body": email.body, "key": email.dedupe_key,
                          "finished": email.finished_at is not None}


async def _jobs():
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        return [(j.kind, j.payload, j.priority) for j in (await db.execute(select(Job).order_by(Job.id))).scalars()]


LATER = timedelta(minutes=20)


# ── sending ───────────────────────────────────────────────────────────────────

def test_the_server_registers_the_email_sender_in_the_email_lane():
    import main  # noqa: F401
    from app.services import jobs
    sender = jobs.handler_for("email.send")
    assert sender.lane == "email" and sender.on_failure is not None


def test_a_queued_email_is_sent_with_no_connection_held(client, run_jobs, service, done_email):
    _, m = register(client, "ej1@co.com")
    email_id = _run(_queue(manager_id=m["id"], interview_id=5, dedupe_key="done:5",
                           to_address="typed@x.com", subject="Hi", body="Words"))
    assert _run(_jobs()) == [("email.send", {"email_id": email_id}, 100)]
    assert run_jobs() == ["done"]
    assert [(c["to"], c["subject"], c["held"]) for c in service] == [("mgr@co.com", "Interview finished", 0)]
    # Kept: that it went, and its key, so it isn't queued again. Wiped: the
    # typed address and the words.
    assert _run(_email(email_id)) == {"status": "sent", "error": None, "to": None, "subject": None, "body": None,
                                      "key": "done:5", "finished": True}


def test_a_busy_email_service_is_tried_again_later(client, run_jobs, service, done_email):
    from app.services import email_service as module
    service.stub.answers = [module.BUSY, module.SENT]
    email_id = _run(_queue())
    assert run_jobs() == ["retry"]
    assert _run(_email(email_id))["status"] == "queued"
    assert run_jobs(now=datetime.utcnow() + LATER) == ["done"]
    assert len(service) == 2 and _run(_email(email_id))["status"] == "sent"


def test_an_email_the_service_never_takes_fails_saying_so(client, run_jobs, service, done_email):
    from app.services import email_service as module, outbox
    service.stub.answers = [module.BUSY]
    email_id = _run(_queue(dedupe_key="done:6", to_address="typed@x.com"))
    outcomes = [run_jobs(now=datetime.utcnow() + LATER * n) for n in range(7)]
    assert sum(outcomes, []) == ["retry"] * 5 + ["failed"]
    assert len(service) == 6
    # The key is free again: another may be queued.
    assert _run(_email(email_id)) == {"status": "failed", "error": outbox.NO_ANSWER, "to": None, "subject": None,
                                      "body": None, "key": None, "finished": True}


@pytest.mark.parametrize("answer, said", [("refused", "REFUSED"), ("off", "NOT_SET_UP")])
def test_an_email_refused_or_with_email_not_set_up_fails_at_once(client, run_jobs, service, done_email,
                                                                  answer, said):
    from app.services import outbox
    service.stub.answers = [answer]
    email_id = _run(_queue(dedupe_key="done:7"))
    assert run_jobs() == ["done"]
    assert len(service) == 1
    email = _run(_email(email_id))
    assert (email["status"], email["error"], email["key"]) == ("failed", getattr(outbox, said), None)


def test_an_email_with_nothing_to_send_is_skipped(client, run_jobs, service, done_email):
    done_email.nothing = True
    email_id = _run(_queue(to_address="typed@x.com"))
    assert run_jobs() == ["done"]
    assert service == []
    email = _run(_email(email_id))
    assert (email["status"], email["to"], email["finished"]) == ("skipped", None, True)


def test_an_email_no_longer_queued_or_gone_is_left_alone(client, run_jobs, service, done_email):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    cancelled, gone = _run(_queue()), _run(_queue())

    async def change():
        async with database.async_session() as db:
            (await db.get(EmailOutbox, cancelled)).status = "cancelled"
            await db.delete(await db.get(EmailOutbox, gone))
            await db.commit()
    _run(change())
    assert run_jobs() == ["done", "done"]
    assert service == [] and _run(_email(cancelled))["status"] == "cancelled"


def test_a_kind_with_nothing_to_say_yet_fails_saying_so(client, run_jobs, service, monkeypatch):
    from app.services import outbox
    monkeypatch.setattr(outbox, "COMPOSERS", {})
    email_id = _run(_queue())
    assert run_jobs() == ["done"]
    assert service == [] and _run(_email(email_id))["error"] == outbox.UNKNOWN


def test_one_email_per_key_while_it_stands(client, run_jobs, service, done_email):
    from app.services import email_service as module
    first = _run(_queue(dedupe_key="done:8"))
    assert _run(_queue(dedupe_key="done:8")) is None
    # Failed, the key is free: another is queued.
    service.stub.answers = [module.REFUSED]
    run_jobs()
    again = _run(_queue(dedupe_key="done:8"))
    assert again is not None and again != first


def test_codes_and_resets_go_before_other_emails():
    from app.services import outbox
    assert outbox.URGENT == ("sign_in_code", "erasure_code", "password_reset")


def test_a_code_is_queued_first_in_line(client):
    first = _run(_queue("sign_in_code", to_address="ada@x.com"))
    second = _run(_queue("interview_invitation", interview_id=9))
    assert _run(_jobs()) == [("email.send", {"email_id": first}, 0), ("email.send", {"email_id": second}, 100)]


def test_not_a_kind_of_email_is_refused(client):
    with pytest.raises(ValueError):
        _run(_queue("newsletter"))


def test_emails_that_ended_over_two_weeks_ago_are_deleted(client):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    from app.services import cleanup
    now = datetime.utcnow()

    async def seed():
        async with database.async_session() as db:
            for status, ended in (("sent", now - timedelta(days=15)), ("failed", now - timedelta(days=15)),
                                  ("sent", now - timedelta(days=13)), ("queued", None)):
                db.add(EmailOutbox(kind="interview_done", status=status, finished_at=ended,
                                   created_at=now - timedelta(days=16)))
            await db.commit()

    async def left():
        async with database.async_session() as db:
            return sorted((e.status, e.finished_at is not None)
                          for e in (await db.execute(select(EmailOutbox))).scalars())
    _run(seed())
    _run(cleanup.forget_old_emails({}))
    assert _run(left()) == [("queued", False), ("sent", True)]


def test_the_server_cleans_up_old_emails_daily():
    import main  # noqa: F401
    from app.services import jobs
    assert jobs.handler_for("cleanup.old_emails").every == timedelta(days=1)

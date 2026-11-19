"""What each kind of email says, and when it's queued (app/services/
email_kinds.py), sent by the outbox's job.

The "interview finished" email went inside the request that finished the
interview, after its commit: the candidate's browser, or the interview
worker, waited on the email service, and an email it couldn't send was lost.
"""
import asyncio

import pytest
from sqlalchemy import select

from conftest import register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


AGENT = {"X-Agent-Token": "test-agent-secret"}
SAID = [{"role": "interviewer", "text": "Tell me about a hard bug."},
        {"role": "candidate", "text": "A race between two workers. " * 12}]


@pytest.fixture()
def mailbox(monkeypatch):
    """Email set up, delivering into a list."""
    from app.services.email_service import email_service
    sent = []

    async def deliver(to_email, subject, html_body):
        sent.append({"to": to_email, "subject": subject, "html": html_body})
        return "sent"
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "deliver", deliver)
    return sent


@pytest.fixture(autouse=True)
def reports(monkeypatch):
    """Reports written without the AI."""
    from app.services import interview_report

    async def write_report(transcript, role):
        return "## A report"
    monkeypatch.setattr(interview_report, "write_report", write_report)


async def _started(manager_id, email, mode="conversational", **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.flush()
        interview = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email,
                              role="Data Engineer", mode=mode, status="in_progress", **fields)
        db.add(interview)
        await db.commit()
        return interview.id


async def _told():
    """The interviews whose "interview finished" email is in the outbox."""
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        rows = await db.execute(select(EmailOutbox.interview_id).where(EmailOutbox.kind == "interview_done")
                                .order_by(EmailOutbox.id))
        return list(rows.scalars())


def _finalize(client, email, interview_id):
    from app.services.auth import create_candidate_token
    return client.post("/api/realtime/finalize", headers={"Authorization": f"Bearer {create_candidate_token(email)}"},
                       json={"interview_id": interview_id, "transcript": SAID, "duration": 300})


# ── "interview finished" ──────────────────────────────────────────────────────

def test_the_server_knows_what_the_interview_finished_email_says():
    import main  # noqa: F401
    from app.services import outbox
    assert "interview_done" in outbox.COMPOSERS


def test_the_manager_hears_once_that_a_voice_interview_finished(client, run_jobs, mailbox):
    _, m = register(client, "k1@co.com", name="Grace")
    iid = _run(_started(m["id"], "k1@x.com"))
    assert _finalize(client, "k1@x.com", iid).json()["saved"] is True
    # Finished, the email waits for its job: the candidate's page didn't.
    assert mailbox == [] and _run(_told()) == [iid]
    assert _finalize(client, "k1@x.com", iid).json()["saved"] is False
    run_jobs()
    assert [(mail["to"], mail["subject"]) for mail in mailbox] == [("k1@co.com", "Interview completed — k1@x.com")]
    assert "Hi Grace," in mailbox[0]["html"] and "Data Engineer" in mailbox[0]["html"]


def test_the_manager_hears_once_that_a_video_interview_finished(client, run_jobs, mailbox):
    _, m = register(client, "k2@co.com")
    iid = _run(_started(m["id"], "k2@x.com", mode="avatar", room_name="interview-k2"))
    body = {"candidate_email": "k2@x.com", "room_name": "interview-k2", "duration": 240, "transcript": SAID}
    assert client.post("/api/chat/save-transcript", headers=AGENT, json=body).json()["saved"] is True
    assert mailbox == [] and _run(_told()) == [iid]
    # The worker's second post, as after a timeout.
    assert client.post("/api/chat/save-transcript", headers=AGENT, json=body).json()["saved"] is False
    run_jobs()
    assert [mail["to"] for mail in mailbox] == ["k2@co.com"]


def test_an_interview_is_told_of_once_however_often_it_is_asked(client):
    from app.core import database
    from app.models.candidate import Interview
    from app.services import email_kinds
    _, m = register(client, "k3@co.com")
    iid = _run(_started(m["id"], "k3@x.com"))

    async def tell():
        async with database.async_session() as db:
            await email_kinds.queue_interview_done(db, await db.get(Interview, iid))
            await db.commit()
    _run(tell())
    _run(tell())
    assert _run(_told()) == [iid]


def test_an_interview_with_no_manager_tells_no_one(client):
    from app.core import database
    from app.models.candidate import Interview
    from app.services import email_kinds
    _, m = register(client, "k4@co.com")
    iid = _run(_started(m["id"], "k4@x.com"))

    async def tell():
        async with database.async_session() as db:
            interview = await db.get(Interview, iid)
            interview.manager_id = None
            await email_kinds.queue_interview_done(db, interview)
            await db.commit()
    _run(tell())
    assert _run(_told()) == []

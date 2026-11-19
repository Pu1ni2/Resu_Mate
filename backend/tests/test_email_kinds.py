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


# ── a manager's own address ──────────────────────────────────────────────────

async def _queued(kind):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        rows = await db.execute(select(EmailOutbox).where(EmailOutbox.kind == kind).order_by(EmailOutbox.id))
        return [{"manager": e.manager_id, "to": e.to_address, "subject": e.subject, "body": e.body,
                 "status": e.status} for e in rows.scalars()]


def _token_in(html, page):
    from urllib.parse import parse_qs, urlparse
    from app.core.config import settings
    start = html.index(f"{settings.frontend_url.rstrip('/')}/hiring/{page}?token=")
    return parse_qs(urlparse(html[start:].split('"', 1)[0]).query)["token"][0]


def test_the_server_knows_what_the_links_emails_say():
    import main  # noqa: F401
    from app.services import outbox
    assert {"verify_email", "password_reset"} <= set(outbox.COMPOSERS)


def test_signing_up_queues_the_confirmation_with_no_link_kept(client, run_jobs, mailbox):
    _, m = register(client, "k5@co.com", verified=False)
    # The link is made as it's sent: none is kept.
    assert _run(_queued("verify_email")) == [
        {"manager": m["id"], "to": None, "subject": None, "body": None, "status": "queued"}]
    run_jobs()
    assert [(mail["to"], mail["subject"]) for mail in mailbox] == [("k5@co.com", "Confirm your email for ResuMate")]
    r = client.post("/api/auth/verify-email", json={"token": _token_in(mailbox[0]["html"], "verify-email")})
    assert r.status_code == 200 and r.json()["user"]["email_verified"] is True


def test_no_confirmation_goes_to_an_address_confirmed_meanwhile(client, run_jobs, mailbox):
    import sqlite3
    from conftest import _TMP_DB
    _, m = register(client, "k6@co.com", verified=False)
    # Confirmed with an earlier link before this email's turn came.
    db = sqlite3.connect(_TMP_DB)
    db.execute("UPDATE hiring_managers SET email_verified = 1 WHERE id = ?", (m["id"],))
    db.commit()
    db.close()
    run_jobs()
    assert mailbox == [] and _run(_queued("verify_email"))[0]["status"] == "skipped"


def test_a_reset_is_queued_alike_for_any_address_and_sent_only_to_an_account(client, run_jobs, mailbox):
    import sqlite3
    from conftest import _TMP_DB
    _, m = register(client, "k7@co.com")
    _, gone = register(client, "k7b@co.com")
    db = sqlite3.connect(_TMP_DB)
    db.execute("UPDATE hiring_managers SET is_active = 0 WHERE id = ?", (gone["id"],))
    db.commit()
    db.close()
    for address in ("k7@co.com", "nobody@co.com", "k7b@co.com"):
        assert client.post("/api/auth/forgot-password", json={"email": address}).status_code == 200
    # The same for each: one email queued with the address typed, no link.
    assert [(e["manager"], e["to"], e["body"]) for e in _run(_queued("password_reset"))] == [
        (None, "k7@co.com", None), (None, "nobody@co.com", None), (None, "k7b@co.com", None)]
    run_jobs()
    assert [mail["to"] for mail in mailbox] == ["k7@co.com"]
    assert _token_in(mailbox[0]["html"], "reset")
    # Ended, the typed addresses go.
    assert [(e["to"], e["status"]) for e in _run(_queued("password_reset"))] == [
        (None, "sent"), (None, "skipped"), (None, "skipped")]

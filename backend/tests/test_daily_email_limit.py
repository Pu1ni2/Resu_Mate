"""A manager may send so many emails to candidates in a day.

Any account could send as many as it liked, from ResuMate's address, to any
address it typed in. Each email sent is counted, and the last 24 hours'
are checked before another goes (app/services/email_quota.py).
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from conftest import auth_headers, batch_invite, register

from app.core.config import settings
from app.services import email_quota


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def drafts(monkeypatch):
    """The HR agent drafts without a language model."""
    from app.agents.hr_agent import hr_agent

    async def draft_email(**_):
        return {"subject": "Interview", "body": "Hello"}
    monkeypatch.setattr(hr_agent, "draft_email", draft_email)


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


def _candidate(client, tok, email):
    """A candidate of this manager, with their address on the résumé."""
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    manager_id = client.get("/api/auth/me", headers=auth_headers(tok)).json()["id"]
    text = f"Cand\n{email}\nEngineer"

    async def seed():
        async with database.async_session() as db:
            return (await db_service.create_candidate_db(db, {"name": "Cand", "text": text}, manager_id=manager_id)).id
    cid = _run(seed())
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "manager_id": manager_id, "name": "Cand", "text": text, "is_resume": True,
    }
    return cid, manager_id


def _invite(client, tok, cid, email):
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": cid, "candidate_email": email, "candidate_name": "Cand", "role": "Dev", "send_invite": True,
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _counted(manager_id, when=None):
    """One email sent, as email_quota records it, at `when` if given."""
    from app.core import database
    from app.models.candidate import AuditLog
    async with database.async_session() as db:
        db.add(AuditLog(manager_id=manager_id, actor="manager", action=email_quota.SENT,
                        target_email="earlier@x.com", created_at=when or datetime.utcnow()))
        await db.commit()


async def _sent_count(manager_id):
    from app.core import database
    async with database.async_session() as db:
        return await email_quota.sent_today(db, manager_id)


def test_an_invitation_sent_is_counted(client, run_jobs, mailbox, question_writer):
    tok, _ = register(client, "count@co.com")
    cid, manager_id = _candidate(client, tok, "ada@x.com")
    assert _invite(client, tok, cid, "ada@x.com")["invite"]["status"] == "held"
    # Counted as soon as it's queued, held for its questions, so another tab
    # can't take its place.
    assert _run(_sent_count(manager_id)) == 1
    run_jobs()
    assert mailbox == ["ada@x.com"]
    assert _run(_sent_count(manager_id)) == 1


def test_at_the_limit_the_invitation_waits_and_says_why(client, mailbox, monkeypatch):
    monkeypatch.setattr(settings, "daily_email_limit", 1)
    tok, _ = register(client, "limit@co.com")
    cid, manager_id = _candidate(client, tok, "ada@x.com")
    _run(_counted(manager_id))
    body = _invite(client, tok, cid, "ada@x.com")
    assert body["invite"] == {"email_id": None, "status": "refused", "error": email_quota.limit_reached()}
    assert mailbox == []


def test_a_batch_sends_up_to_the_limit_then_says_why(client, run_jobs, mailbox, monkeypatch):
    monkeypatch.setattr(settings, "daily_email_limit", 1)
    tok, _ = register(client, "batch@co.com")
    first, _ = _candidate(client, tok, "ada@x.com")
    second, _ = _candidate(client, tok, "bea@x.com")
    a, b = batch_invite(client, run_jobs, tok, [first, second], send_emails=True)["outcomes"]
    assert a["email_sent"] is True
    assert b["email_sent"] is False and b["email_send_error"] == email_quota.limit_reached()
    assert mailbox == ["ada@x.com"]


def test_emails_older_than_a_day_and_other_managers_dont_count(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_email_limit", 1)
    _, me = register(client, "old@co.com")
    _, other = register(client, "other@co.com")
    _run(_counted(me["id"], when=datetime.utcnow() - timedelta(hours=25)))
    _run(_counted(other["id"]))

    async def can():
        from app.core import database
        async with database.async_session() as db:
            return await email_quota.can_send(db, me["id"])
    assert _run(can()) is True


# ── counted from when it's queued ─────────────────────────────────────────────

async def _queued_email(manager_id, status="queued", counts=True, when=None):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        db.add(EmailOutbox(kind="interview_invitation", manager_id=manager_id, counts_to_quota=counts,
                           status=status, created_at=when or datetime.utcnow()))
        await db.commit()


def test_an_email_counts_from_when_it_is_queued_unless_it_never_went(client):
    _, me = register(client, "q1@co.com")
    _, other = register(client, "q1b@co.com")
    for status in ("held", "queued", "sent"):
        _run(_queued_email(me["id"], status))
    # One that never went, one not to a candidate, one from yesterday, another manager's.
    for status in ("failed", "skipped", "cancelled"):
        _run(_queued_email(me["id"], status))
    _run(_queued_email(me["id"], counts=False))
    _run(_queued_email(me["id"], when=datetime.utcnow() - timedelta(hours=25)))
    _run(_queued_email(other["id"]))
    # And one sent before the outbox, as the audit log has it.
    _run(_counted(me["id"]))
    assert _run(_sent_count(me["id"])) == 4


async def _take_a_place(manager_id, hold_for=0.0):
    """Reserve a place and queue an email in it, keeping the transaction open
    a while; or why there was none."""
    from app.core import database
    from app.models.auth import HiringManager
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        manager = await db.get(HiringManager, manager_id)
        refused = await email_quota.reserve(db, manager)
        if refused is None:
            db.add(EmailOutbox(kind="interview_invitation", manager_id=manager_id, counts_to_quota=True))
            await asyncio.sleep(hold_for)
            await db.commit()
        return refused


def test_two_at_once_cannot_both_take_the_last_place(client, monkeypatch):
    # Two tabs: each counted the day's emails, found room, and sent.
    monkeypatch.setattr(settings, "daily_email_limit", 1)
    _, me = register(client, "q2@co.com")

    async def both():
        first = asyncio.ensure_future(_take_a_place(me["id"], hold_for=0.3))
        await asyncio.sleep(0.05)
        second = await _take_a_place(me["id"])
        return await first, second
    assert _run(both()) == (None, email_quota.limit_reached())
    assert _run(_sent_count(me["id"])) == 1


def test_an_address_not_confirmed_has_no_place(client):
    _, me = register(client, "q3@co.com", verified=False)
    assert _run(_take_a_place(me["id"])) == email_quota.NOT_CONFIRMED
    assert _run(_sent_count(me["id"])) == 0

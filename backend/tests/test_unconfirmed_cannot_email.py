"""A manager emails candidates once their own address is confirmed.

Anyone could sign up with any address and email candidates from ResuMate.
Until the link sign-up emails is opened, the invitation, the batch's emails
and the reviewed drafts wait and say why; the interviews are still made, with
the portal link to share. A confirmed manager sends as before.
"""
import asyncio
from types import SimpleNamespace

import pytest

from conftest import auth_headers, register

from app.services.email_quota import NOT_CONFIRMED


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
    """A server with email set up, delivering into a list. Sign-up's own
    email, the link to confirm the address, isn't counted."""
    from app.services.email_service import email_service
    sent = []

    async def send(to_email, subject, html_body):
        if subject != "Confirm your email for ResuMate":
            sent.append(to_email)
        return True
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send", send)
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
    return cid


def _invite(client, tok, cid, email):
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": cid, "candidate_email": email, "candidate_name": "Cand", "role": "Dev", "send_invite": True,
    })
    assert r.status_code == 200, r.text
    return r.json()


def _batch(client, tok, ids, **extra):
    r = client.post("/api/pipeline/batch-action", headers=auth_headers(tok),
                    json={"candidate_ids": ids, "role": "Dev", **extra})
    assert r.status_code == 200, r.text
    return r.json()["outcomes"]


def test_an_invitation_waits_until_the_address_is_confirmed(client, mailbox):
    tok, _ = register(client, "new@co.com", verified=False)
    cid = _candidate(client, tok, "ada@x.com")
    body = _invite(client, tok, cid, "ada@x.com")
    assert body["invite_sent"] is False
    assert body["invite_error"] == NOT_CONFIRMED
    # The interview is made, with the link to share.
    assert body["interview_config"]["interview_id"] and body["portal_link"]
    assert mailbox == []


def test_a_confirmed_manager_invites_as_before(client, mailbox):
    tok, _ = register(client, "sure@co.com")
    cid = _candidate(client, tok, "ada@x.com")
    assert _invite(client, tok, cid, "ada@x.com")["invite_sent"] is True
    assert mailbox == ["ada@x.com"]


def test_a_batch_makes_the_interviews_and_says_why_none_was_emailed(client, mailbox):
    tok, _ = register(client, "batch@co.com", verified=False)
    ids = [_candidate(client, tok, "ada@x.com"), _candidate(client, tok, "bea@x.com")]
    outcomes = _batch(client, tok, ids, send_emails=True)
    assert [o["interview_created"] for o in outcomes] == [True, True]
    assert [o["email_sent"] for o in outcomes] == [False, False]
    assert [o["email_send_error"] for o in outcomes] == [NOT_CONFIRMED, NOT_CONFIRMED]
    assert mailbox == []


def test_reviewed_drafts_wait_too(client, mailbox):
    tok, _ = register(client, "drafts@co.com", verified=False)
    outcome = _batch(client, tok, [_candidate(client, tok, "ada@x.com")])[0]
    r = client.post("/api/pipeline/send-invites", headers=auth_headers(tok), json={"invites": [
        {"interview_id": outcome["interview_id"], "subject": "Interview", "body": "Hello"},
    ]})
    assert r.status_code == 200, r.text
    sent = r.json()
    assert sent["emails_sent"] == 0
    assert sent["outcomes"][0]["error"] == NOT_CONFIRMED
    assert mailbox == []


def test_no_interview_news_goes_to_an_address_not_yet_confirmed(client, mailbox):
    from app.api.chat import _notify_manager_interview_complete
    from app.core import database
    _, unsure = register(client, "unsure@co.com", verified=False)
    _, sure = register(client, "sure2@co.com")

    async def notify(manager_id):
        async with database.async_session() as db:
            interview = SimpleNamespace(manager_id=manager_id, candidate_email="ada@x.com", role="Dev")
            await _notify_manager_interview_complete(db, interview)
    _run(notify(unsure["id"]))
    _run(notify(sure["id"]))
    assert mailbox == ["sure2@co.com"]

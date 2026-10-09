"""Invitations reach the candidate, or the manager learns they didn't.

Batch actions read candidate["email"], which an upload usually doesn't set, so
the interview and the portal grant went to an empty address while the manager
was told the candidate was invited. Creating a single interview sent nothing.
"""
import asyncio

import pytest
from sqlalchemy import select

from conftest import auth_headers, register

from app.core.config import settings

PORTAL = settings.candidate_login_url


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
def no_email(monkeypatch):
    """A server without email set up."""
    from app.services.email_service import email_service
    monkeypatch.setattr(email_service, "_sg", None)


@pytest.fixture()
def mailbox(monkeypatch):
    """A server with email set up, delivering into a list."""
    from app.services.email_service import email_service
    sent = []

    async def send(to_email, subject, html_body):
        sent.append({"to": to_email, "subject": subject, "html": html_body})
        return True
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send", send)
    return sent


def _own_candidate(client, tok, text):
    """A candidate of this manager, as an upload leaves them: no email field."""
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    manager_id = client.get("/api/auth/me", headers=auth_headers(tok)).json()["id"]

    async def seed():
        async with database.async_session() as db:
            row = await db_service.create_candidate_db(db, {"name": "Cand", "text": text}, manager_id=manager_id)
            return row.id

    cid = _run(seed())
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "manager_id": manager_id, "name": "Cand", "text": text, "is_resume": True,
    }
    return cid


def _rows(model, **where):
    from app.core import database

    async def read():
        async with database.async_session() as db:
            query = select(model)
            for column, value in where.items():
                query = query.where(getattr(model, column) == value)
            return (await db.execute(query)).scalars().all()
    return _run(read())


def _batch(client, tok, ids, **extra):
    r = client.post("/api/pipeline/batch-action", headers=auth_headers(tok),
                    json={"candidate_ids": ids, "role": "Dev", **extra})
    assert r.status_code == 200, r.text
    return r.json()


# ── batch actions ─────────────────────────────────────────────────────────────

def test_a_batch_invites_the_address_on_the_resume(client):
    from app.models.candidate import CandidateAccess, Interview
    tok, _ = register(client, "b1@co.com")
    cid = _own_candidate(client, tok, "Cand\nCand.One@x.com | 555-0100\nEngineer")
    body = _batch(client, tok, [cid])
    outcome = body["outcomes"][0]
    assert outcome["email"] == "cand.one@x.com"
    assert outcome["interview_created"] is True
    assert [iv.candidate_email for iv in _rows(Interview, candidate_id=cid)] == ["cand.one@x.com"]
    assert len(_rows(CandidateAccess, email="cand.one@x.com")) == 1
    assert body["portal_link"] == PORTAL


def test_a_candidate_without_an_address_is_skipped_not_invited(client):
    from app.models.candidate import CandidateAccess, Interview
    tok, _ = register(client, "b2@co.com")
    cid = _own_candidate(client, tok, "Cand\nEngineer, no contact line")
    body = _batch(client, tok, [cid], send_emails=True)
    outcome = body["outcomes"][0]
    assert outcome["interview_created"] is False
    assert outcome["email_sent"] is False
    assert "No email address" in outcome["skipped"]
    assert (body["interviews_created"], body["skipped"]) == (0, 1)
    assert _rows(Interview, candidate_id=cid) == []
    assert _rows(CandidateAccess, email="") == []


def test_a_batch_emails_the_invite_with_the_portal_link(client, mailbox):
    tok, _ = register(client, "b3@co.com")
    cid = _own_candidate(client, tok, "Cand\ncand3@x.com")
    body = _batch(client, tok, [cid], send_emails=True)
    assert body["outcomes"][0]["email_sent"] is True
    assert body["emails_sent"] == 1
    assert [m["to"] for m in mailbox] == ["cand3@x.com"]
    assert PORTAL in mailbox[0]["html"]


def test_a_batch_says_when_email_is_not_set_up(client, no_email):
    tok, _ = register(client, "b4@co.com")
    cid = _own_candidate(client, tok, "Cand\ncand4@x.com")
    body = _batch(client, tok, [cid], send_emails=True)
    outcome = body["outcomes"][0]
    assert outcome["interview_created"] is True
    assert outcome["email_sent"] is False
    assert "isn't set up" in outcome["email_send_error"]
    assert body["emails_sent"] == 0


def test_a_batch_emails_only_when_asked(client, mailbox):
    tok, _ = register(client, "b5@co.com")
    cid = _own_candidate(client, tok, "Cand\ncand5@x.com")
    body = _batch(client, tok, [cid])
    assert body["outcomes"][0]["email_sent"] is False
    assert mailbox == []


def test_no_invite_for_an_interview_that_was_not_saved(client, mailbox, monkeypatch):
    from app.services import db_service

    async def not_saved(db, data):
        return None
    monkeypatch.setattr(db_service, "create_interview", not_saved)
    tok, _ = register(client, "b6@co.com")
    cid = _own_candidate(client, tok, "Cand\ncand6@x.com")
    body = _batch(client, tok, [cid], send_emails=True)
    outcome = body["outcomes"][0]
    assert outcome["interview_created"] is False
    assert outcome["email_sent"] is False
    assert body["interviews_created"] == 0
    assert mailbox == []


# ── one interview ─────────────────────────────────────────────────────────────

def _create(client, tok, cid, email, **extra):
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": cid, "candidate_email": email, "candidate_name": "Cand", "role": "Dev", **extra,
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_creating_an_interview_can_email_the_invite(client, mailbox):
    tok, _ = register(client, "c1@co.com")
    cid = _own_candidate(client, tok, "Cand\nc1@x.com")
    body = _create(client, tok, cid, "C1@x.com", send_invite=True)
    assert (body["invite_sent"], body["invite_error"]) == (True, None)
    assert [m["to"] for m in mailbox] == ["c1@x.com"]
    assert PORTAL in mailbox[0]["html"]
    assert "Dev" in mailbox[0]["subject"]


def test_creating_an_interview_emails_only_when_asked(client, mailbox):
    tok, _ = register(client, "c2@co.com")
    cid = _own_candidate(client, tok, "Cand\nc2@x.com")
    body = _create(client, tok, cid, "c2@x.com")
    assert (body["invite_sent"], body["invite_error"]) == (False, None)
    assert body["portal_link"] == PORTAL
    assert mailbox == []


def test_without_email_the_manager_gets_the_link_to_share(client, no_email):
    tok, _ = register(client, "c3@co.com")
    cid = _own_candidate(client, tok, "Cand\nc3@x.com")
    body = _create(client, tok, cid, "c3@x.com", send_invite=True)
    assert body["invite_sent"] is False
    assert "isn't set up" in body["invite_error"]
    assert body["portal_link"] == PORTAL


def test_a_refused_invite_is_reported(client, monkeypatch):
    from app.services.email_service import email_service

    async def refused(to_email, subject, html_body):
        return False
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send", refused)
    tok, _ = register(client, "c4@co.com")
    cid = _own_candidate(client, tok, "Cand\nc4@x.com")
    body = _create(client, tok, cid, "c4@x.com", send_invite=True)
    assert body["invite_sent"] is False
    assert "didn't accept" in body["invite_error"]


def test_a_name_with_markup_is_escaped_in_the_invite(client, mailbox):
    tok, _ = register(client, "c5@co.com")
    cid = _own_candidate(client, tok, "Cand\nc5@x.com")
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": cid, "candidate_email": "c5@x.com", "candidate_name": "<b>Cand</b>",
        "role": "R&D <Lead>", "send_invite": True,
    })
    assert r.status_code == 200, r.text
    html = mailbox[0]["html"]
    assert "Hi &lt;b&gt;Cand&lt;/b&gt;," in html
    assert "R&amp;D &lt;Lead&gt;" in html
    assert "<b>Cand</b>" not in html


def test_the_managers_completion_email_is_escaped_too(client, mailbox):
    from types import SimpleNamespace
    from app.api.chat import _notify_manager_interview_complete
    from app.core import database
    _, m = register(client, "c6@co.com", name="<i>Boss</i>")
    interview = SimpleNamespace(manager_id=m["id"], candidate_email="c6@x.com", role="<script>x</script>")

    async def notify():
        async with database.async_session() as db:
            await _notify_manager_interview_complete(db, interview)
    _run(notify())
    html = mailbox[0]["html"]
    assert "Hi &lt;i&gt;Boss&lt;/i&gt;," in html
    assert "&lt;script&gt;" in html and "<script>" not in html


# ── sending the drafts the manager reviewed ──────────────────────────────────

def _send(client, tok, invites, status=200):
    r = client.post("/api/pipeline/send-invites", headers=auth_headers(tok), json={"invites": invites})
    assert r.status_code == status, r.text
    return r.json()


def _drafted(client, tok, email):
    """A batch in draft mode: the interview is made, nothing is emailed."""
    cid = _own_candidate(client, tok, f"Cand\n{email}")
    outcome = _batch(client, tok, [cid])["outcomes"][0]
    assert outcome["interview_created"] and not outcome["email_sent"]
    return cid, outcome["interview_id"]


def test_the_reviewed_draft_is_sent_as_written_with_the_link(client, mailbox):
    from app.models.candidate import Interview
    tok, _ = register(client, "d1@co.com")
    cid, iv = _drafted(client, tok, "d1@x.com")
    body = _send(client, tok, [{"interview_id": iv, "subject": "Let's talk\nsoon", "body": "Dear Cand,\nSee you <soon>."}])
    assert body["emails_sent"] == 1
    assert body["outcomes"] == [{"interview_id": iv, "email": "d1@x.com", "email_sent": True}]
    assert [(m["to"], m["subject"]) for m in mailbox] == [("d1@x.com", "Let's talk soon")]
    assert "Dear Cand,<br>See you &lt;soon&gt;." in mailbox[0]["html"]
    assert PORTAL in mailbox[0]["html"]
    # The interview isn't made a second time.
    assert len(_rows(Interview, candidate_id=cid)) == 1


def test_drafts_go_only_to_this_managers_interviews(client, mailbox):
    owner, _ = register(client, "d2@co.com")
    other, _ = register(client, "d3@co.com")
    _, iv = _drafted(client, owner, "d2@x.com")
    body = _send(client, other, [{"interview_id": iv, "subject": "Hi", "body": "Hello"}])
    assert body["outcomes"] == [{"interview_id": iv, "email_sent": False, "error": "Interview not found"}]
    assert mailbox == []


def test_no_draft_for_a_finished_interview(client, mailbox):
    from app.core import database
    from app.models.candidate import Interview
    tok, _ = register(client, "d4@co.com")
    _, iv = _drafted(client, tok, "d4@x.com")

    async def finish():
        async with database.async_session() as db:
            (await db.get(Interview, iv)).status = "completed"
            await db.commit()
    _run(finish())
    body = _send(client, tok, [{"interview_id": iv, "subject": "Hi", "body": "Hello"}])
    assert body["outcomes"][0]["error"] == "This interview is already complete."
    assert mailbox == []


def test_an_interview_listed_twice_is_emailed_once(client, mailbox):
    tok, _ = register(client, "d5@co.com")
    _, iv = _drafted(client, tok, "d5@x.com")
    draft = {"interview_id": iv, "subject": "Hi", "body": "Hello"}
    assert _send(client, tok, [draft, draft])["emails_sent"] == 1
    assert len(mailbox) == 1


def test_sending_drafts_without_email_set_up_says_so(client, no_email):
    tok, _ = register(client, "d6@co.com")
    _, iv = _drafted(client, tok, "d6@x.com")
    body = _send(client, tok, [{"interview_id": iv, "subject": "Hi", "body": "Hello"}], status=503)
    assert "isn't set up" in body["detail"]

"""Emails through an outbox: each one kept until a background job has sent it
(app/models/email_outbox.py).

Eight places sent email, each its own way: some inside the request, some just
after the response, where a restart lost them, and none tried again when the
email service was busy.
"""
import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _email(**fields):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        email = EmailOutbox(**{"kind": "interview_invitation", **fields})
        db.add(email)
        await db.commit()
        return email.id


async def _emails():
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    async with database.async_session() as db:
        return sorted((e.kind, e.manager_id, e.interview_id, e.to_address)
                      for e in (await db.execute(select(EmailOutbox))).scalars())


async def _interview(manager_id, email, candidate_id=None):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        if candidate_id is None:
            cand = Candidate(manager_id=manager_id, name="Ada", email=email)
            db.add(cand)
            await db.flush()
            candidate_id = cand.id
        interview = Interview(candidate_id=candidate_id, manager_id=manager_id, candidate_email=email,
                              role="Dev", mode="conversational")
        db.add(interview)
        await db.commit()
        return candidate_id, interview.id


# ── the table ─────────────────────────────────────────────────────────────────

def test_a_new_email_waits_its_turn(client):
    from app.core import database
    from app.models.email_outbox import EmailOutbox
    _, m = register(client, "eo1@co.com")
    email_id = _run(_email(manager_id=m["id"], interview_id=5))

    async def read():
        async with database.async_session() as db:
            email = await db.get(EmailOutbox, email_id)
            return (email.status, email.counts_to_quota, email.error, email.to_address, email.subject,
                    email.body, email.finished_at is None, email.created_at is not None)
    assert _run(read()) == ("queued", False, None, None, None, None, True, True)


def test_an_interview_has_one_invitation_while_it_stands(client):
    _, m = register(client, "eo2@co.com")
    _run(_email(manager_id=m["id"], interview_id=5, dedupe_key="invite:5"))
    with pytest.raises(IntegrityError):
        _run(_email(manager_id=m["id"], interview_id=5, dedupe_key="invite:5"))
    # Another interview's is its own; one cleared (it failed) frees the key.
    _run(_email(manager_id=m["id"], interview_id=6, dedupe_key="invite:6"))
    _run(_email(manager_id=m["id"], interview_id=5, status="failed"))
    _run(_email(manager_id=m["id"], interview_id=5, status="failed"))
    assert len(_run(_emails())) == 4


# ── what goes when something is deleted ───────────────────────────────────────

def test_deleting_an_account_deletes_its_emails(client):
    tok, m = register(client, "eo3@co.com")
    _, other = register(client, "eo3b@co.com")
    _run(_email(manager_id=m["id"], interview_id=5, subject="Hi Ada", body="Your interview"))
    _run(_email(kind="verify_email", manager_id=m["id"]))
    _run(_email(manager_id=other["id"], interview_id=6))
    r = client.post("/api/auth/delete-account", headers=auth_headers(tok), json={"password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert _run(_emails()) == [("interview_invitation", other["id"], 6, None)]


def test_deleting_a_candidate_deletes_the_emails_about_their_interviews(client):
    tok, m = register(client, "eo4@co.com")
    ada, ada_interview = _run(_interview(m["id"], "ada@x.com"))
    _, grace_interview = _run(_interview(m["id"], "grace@x.com"))
    _run(_email(manager_id=m["id"], interview_id=ada_interview, dedupe_key=f"invite:{ada_interview}"))
    _run(_email(kind="interview_done", manager_id=m["id"], interview_id=ada_interview))
    _run(_email(manager_id=m["id"], interview_id=grace_interview))
    r = client.delete(f"/api/candidates/{ada}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert _run(_emails()) == [("interview_invitation", m["id"], grace_interview, None)]


def test_erasing_a_person_deletes_the_emails_about_them_and_to_them(client):
    from app.core import database
    from app.services.erasure import erase_person
    _, m = register(client, "eo5@co.com")
    _, ada_interview = _run(_interview(m["id"], "ada@x.com"))
    _, grace_interview = _run(_interview(m["id"], "grace@x.com"))
    _run(_email(manager_id=m["id"], interview_id=ada_interview))
    # A code asked for, typed in any case.
    _run(_email(kind="sign_in_code", to_address="Ada@X.com"))
    _run(_email(kind="sign_in_code", to_address="grace@x.com"))
    _run(_email(manager_id=m["id"], interview_id=grace_interview))

    async def erase():
        async with database.async_session() as db:
            await erase_person(db, "ada@x.com")
    _run(erase())
    assert _run(_emails()) == [("interview_invitation", m["id"], grace_interview, None),
                               ("sign_in_code", None, None, "grace@x.com")]

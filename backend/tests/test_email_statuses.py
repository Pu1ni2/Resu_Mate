"""How a manager's emails went, as their pages follow them (GET /api/emails,
app/api/emails.py): whether each has gone, and why not, never whom it was
to or what it said.
"""
import asyncio

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


def _statuses(client, tok, ids, status=200):
    r = client.get("/api/emails", headers=auth_headers(tok), params={"ids": ids})
    assert r.status_code == status, r.text
    return r.json()


def test_a_manager_sees_how_their_emails_went_and_nothing_more(client):
    tok, m = register(client, "es1@co.com")
    sent = _run(_email(manager_id=m["id"], interview_id=4, status="sent"))
    failed = _run(_email(manager_id=m["id"], interview_id=5, status="failed",
                         error="The email service refused it.", subject="Hi Ada", body="The words"))
    assert _statuses(client, tok, f"{failed},{sent},{sent}") == {"emails": [
        {"id": sent, "kind": "interview_invitation", "interview_id": 4, "status": "sent", "error": None},
        {"id": failed, "kind": "interview_invitation", "interview_id": 5, "status": "failed",
         "error": "The email service refused it."},
    ]}


def test_others_emails_and_unknown_ones_are_left_out(client):
    tok, m = register(client, "es2@co.com")
    _, other = register(client, "es2b@co.com")
    mine = _run(_email(manager_id=m["id"]))
    theirs = _run(_email(manager_id=other["id"]))
    # A code, which has no manager: anyone's.
    code = _run(_email(kind="sign_in_code", to_address="ada@x.com"))
    assert [e["id"] for e in _statuses(client, tok, f"{mine},{theirs},{code},99999")["emails"]] == [mine]


def test_asking_after_emails_needs_a_signed_in_manager(client):
    r = client.get("/api/emails", params={"ids": "1"})
    assert r.status_code in (401, 403)


def test_ids_that_arent_numbers_or_too_many_are_refused(client):
    tok, _ = register(client, "es3@co.com")
    assert "separated by commas" in _statuses(client, tok, "1,two", status=400)["detail"]
    assert "up to 100" in _statuses(client, tok, ",".join(str(n) for n in range(1, 102)), status=400)["detail"]
    assert _statuses(client, tok, "") == {"emails": []}

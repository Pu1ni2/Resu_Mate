"""A sign-in code request answers the same whether or not the address has been
invited.

It said "No interview access found" to an address no one had invited, and a
503 when an invited one's email failed, so anyone could find out whom a company
was interviewing. A fifth wrong guess said "tried too many times", which only
an address that was sent a code can hear.
"""
import asyncio

import pytest

from conftest import register

from app.services.codes import MAX_WRONG, WRONG_CODE

INVITED = "invited@x.com"
STRANGER = "stranger@x.com"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _invite(client, manager_email, email=INVITED):
    """A manager's candidate, given portal access."""
    from app.core import database
    from app.services import db_service
    _, manager = register(client, manager_email)

    async def grant():
        async with database.async_session() as db:
            cand = await db_service.create_candidate_db(db, {"name": "Cand", "email": email}, manager_id=manager["id"])
            await db_service.create_candidate_access(db, email, "Cand", cand.id, manager_id=manager["id"])
    _run(grant())


@pytest.fixture()
def mailbox(monkeypatch):
    """Email set up, with what it would send kept here instead."""
    from app.services.email_service import email_service
    sent = []

    async def send_otp(to_email, code):
        sent.append((to_email, code))
        return True

    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send_otp", send_otp)
    return sent


def _ask(client, email):
    return client.post("/api/auth/candidate/send-otp", json={"email": email})


def _guess(client, email, code):
    return client.post("/api/auth/candidate/verify-otp", json={"email": email, "code": code})


def test_an_invited_address_and_a_stranger_get_the_same_answer(client, mailbox):
    _invite(client, "same1@co.com")
    invited, stranger = _ask(client, INVITED), _ask(client, STRANGER)
    assert invited.status_code == stranger.status_code == 200
    # The same words, each for the address that was asked about.
    assert invited.json() == {**stranger.json(), "email": INVITED}
    assert "debug_code" not in invited.json()
    # Only the invited address was sent a code.
    assert [to for to, _ in mailbox] == [INVITED]


def test_an_email_that_fails_gets_the_same_answer_and_leaves_the_log_without_the_code(client, mailbox, monkeypatch, capsys):
    from app.services.email_service import email_service
    tried = []

    async def fails(to_email, code):
        tried.append(code)
        return False

    monkeypatch.setattr(email_service, "send_otp", fails)
    _invite(client, "same2@co.com")
    failed = _ask(client, INVITED)
    assert failed.status_code == 200
    assert failed.json()["message"] == _ask(client, STRANGER).json()["message"]
    logged = capsys.readouterr().out
    assert tried and tried[0] not in logged
    assert INVITED not in logged


def test_a_stranger_guessing_hears_what_an_invited_address_does(client, mailbox):
    _invite(client, "same3@co.com")
    _ask(client, INVITED)
    wrong = f"{(int(mailbox[0][1]) + 1) % 10**6:06d}"
    answers = [_guess(client, INVITED, wrong) for _ in range(MAX_WRONG)] + [_guess(client, STRANGER, wrong) for _ in range(MAX_WRONG)]
    assert {(a.status_code, a.json()["detail"]) for a in answers} == {(400, WRONG_CODE)}

"""Wrong guesses at a one-time code, counted on the code.

Five wrong guesses used a deletion code up, but the count lived in the server's
memory, so it started again on every restart, and the free plan's server sleeps
when idle. Candidate sign-in codes had no limit at all: with enough addresses to
guess from, a code could be found.
"""
import asyncio

import pytest
from sqlalchemy import select

from conftest import auth_headers, register

from app.services.codes import CODE_USED_UP, MAX_WRONG, WRONG_CODE, Outcome


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _other(code, n):
    """A guess that is certainly not `code`."""
    return f"{(int(code) + n) % 10**6:06d}"


@pytest.fixture()
def no_email(monkeypatch):
    """No email set up, so a DEBUG server shows the code."""
    from app.services.email_service import email_service
    monkeypatch.setattr(email_service, "_sg", None)


def _issue(email):
    from app.core import database
    from app.services.codes import issue_code

    async def issue():
        async with database.async_session() as db:
            return await issue_code(db, email)
    return _run(issue())


def _guess(email, submitted):
    from app.core import database
    from app.services.codes import redeem_code

    async def guess():
        async with database.async_session() as db:
            return await redeem_code(db, email, submitted)
    return _run(guess())


def _counts(email):
    """wrong_guesses of the address's open codes, as stored."""
    from app.core import database
    from app.models.auth import OTPCode

    async def read():
        async with database.async_session() as db:
            return (await db.execute(select(OTPCode.wrong_guesses).where(
                OTPCode.email == email, OTPCode.used == False))).scalars().all()  # noqa: E712
    return _run(read())


# ── the code service (client gives each test a clean database) ────────────────

def test_a_wrong_guess_is_counted_on_the_code_in_the_database(client):
    code = _issue("count@x.com")
    assert _guess("count@x.com", _other(code, 1)) is Outcome.WRONG
    assert _guess("count@x.com", _other(code, 2)) is Outcome.WRONG
    # Stored with the code, so a restart can't start the count again.
    assert _counts("count@x.com") == [2]


def test_the_last_wrong_guess_allowed_uses_the_code_up(client):
    code = _issue("five@x.com")
    outcomes = [_guess("five@x.com", _other(code, n)) for n in range(1, MAX_WRONG + 1)]
    assert outcomes == [Outcome.WRONG] * (MAX_WRONG - 1) + [Outcome.USED_UP]
    assert _guess("five@x.com", code) is Outcome.WRONG  # the right code, too late
    assert _guess("five@x.com", _issue("five@x.com")) is Outcome.REDEEMED  # a new one works


def test_a_mistyped_code_still_works_before_the_limit(client):
    code = _issue("typo@x.com")
    for n in range(1, MAX_WRONG):
        _guess("typo@x.com", _other(code, n))
    assert _guess("typo@x.com", code) is Outcome.REDEEMED
    assert _guess("typo@x.com", code) is Outcome.WRONG  # once only


def test_only_a_redeemed_code_reads_as_true():
    assert Outcome.REDEEMED
    assert not Outcome.WRONG
    assert not Outcome.USED_UP


# ── candidate sign-in ─────────────────────────────────────────────────────────

async def _grant(manager_id, email):
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(db, {"name": "Cand", "email": email}, manager_id=manager_id)
        await db_service.create_candidate_access(db, email, "Cand", cand.id, manager_id=manager_id)


def _signs_in(client, manager_email, email):
    tok, _ = register(client, manager_email)
    _run(_grant(client.get("/api/auth/me", headers=auth_headers(tok)).json()["id"], email))

    def send():
        r = client.post("/api/auth/candidate/send-otp", json={"email": email})
        assert r.status_code == 200, r.text
        return r.json()["debug_code"]

    def verify(code):
        return client.post("/api/auth/candidate/verify-otp", json={"email": email, "code": code})
    return send, verify


def test_five_wrong_sign_in_codes_use_the_code_up(client, no_email):
    send, verify = _signs_in(client, "g1@co.com", "signin@x.com")
    code = send()
    answers = [verify(_other(code, n)) for n in range(1, MAX_WRONG + 1)]
    assert [a.status_code for a in answers] == [400] * MAX_WRONG
    assert [a.json()["detail"] for a in answers] == [WRONG_CODE] * (MAX_WRONG - 1) + [CODE_USED_UP]
    assert verify(code).status_code == 400
    assert verify(send()).status_code == 200  # a new code works


def test_a_mistyped_sign_in_code_still_works_before_the_limit(client, no_email):
    send, verify = _signs_in(client, "g2@co.com", "typo-signin@x.com")
    code = send()
    for n in range(1, MAX_WRONG):
        assert verify(_other(code, n)).status_code == 400
    assert verify(code).status_code == 200

"""Forgot password: a link by email that sets a new password, once.

A manager who forgot their password had no way back into the account.
"""
import asyncio
import time
from urllib.parse import parse_qs, urlparse

import pytest
from jose import jwt
from sqlalchemy import select

from conftest import register

from app.api.auth import FORGOT_PASSWORD_ANSWER, RESET_LINK_INVALID
from app.core.config import settings


@pytest.fixture()
def mailbox(monkeypatch):
    """Email that is set up, delivering into a list."""
    from app.services.email_service import email_service
    sent = []

    async def send(to_email, subject, html_body):
        sent.append({"to": to_email, "subject": subject, "html": html_body})
        return True
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send", send)
    return sent


@pytest.fixture()
def no_email(monkeypatch):
    from app.services.email_service import email_service
    monkeypatch.setattr(email_service, "_sg", None)


def _forgot(client, email):
    r = client.post("/api/auth/forgot-password", json={"email": email})
    assert r.status_code == 200, r.text
    return r.json()


def _token_in(html):
    start = html.index(f"{settings.frontend_url.rstrip('/')}/hiring/reset?token=")
    link = html[start:].split('"', 1)[0]
    return parse_qs(urlparse(link).query)["token"][0]


def _reset(client, token, password="brand-new-pass"):
    return client.post("/api/auth/reset-password", json={"token": token, "password": password})


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password}).status_code


# ── asking for a link ─────────────────────────────────────────────────────────

def test_a_manager_is_emailed_a_reset_link(client, mailbox):
    register(client, "fp1@co.com")
    assert _forgot(client, "FP1@co.com ") == {"message": FORGOT_PASSWORD_ANSWER}
    assert [m["to"] for m in mailbox] == ["fp1@co.com"]
    assert _token_in(mailbox[0]["html"])


def test_an_unknown_address_gets_the_same_answer_and_no_email(client, mailbox):
    assert _forgot(client, "nobody@co.com") == {"message": FORGOT_PASSWORD_ANSWER}
    assert mailbox == []


def test_without_email_set_up_a_debug_server_shows_the_link(client, no_email):
    """As send-otp's debug_code: local development works without email. The
    tests run with DEBUG on; production has it off."""
    register(client, "fp2@co.com")
    link = _forgot(client, "fp2@co.com")["debug_reset_link"]
    assert link.startswith(f"{settings.frontend_url.rstrip('/')}/hiring/reset?token=")
    assert "debug_reset_link" not in _forgot(client, "nobody@co.com")


# ── using it ──────────────────────────────────────────────────────────────────

def test_the_link_sets_a_new_password(client, mailbox):
    register(client, "fp3@co.com")
    _forgot(client, "fp3@co.com")
    r = _reset(client, _token_in(mailbox[0]["html"]))
    assert r.status_code == 200, r.text
    assert _login(client, "fp3@co.com", "brand-new-pass") == 200
    assert _login(client, "fp3@co.com", "pw12345678") == 401


def test_the_link_works_once(client, mailbox):
    register(client, "fp4@co.com")
    _forgot(client, "fp4@co.com")
    token = _token_in(mailbox[0]["html"])
    assert _reset(client, token).status_code == 200
    again = _reset(client, token, "another-pass-1")
    assert again.status_code == 400
    assert again.json()["detail"] == RESET_LINK_INVALID
    assert _login(client, "fp4@co.com", "brand-new-pass") == 200


def test_a_short_password_is_refused_and_the_link_still_works(client, mailbox):
    register(client, "fp5@co.com")
    _forgot(client, "fp5@co.com")
    token = _token_in(mailbox[0]["html"])
    assert _reset(client, token, "short").status_code == 400
    assert _reset(client, token).status_code == 200


def _link_token(email):
    """The token forgot-password would email this manager now."""
    from app.core import database
    from app.models.auth import HiringManager
    from app.services.auth import create_reset_token

    async def make():
        async with database.async_session() as db:
            manager = (await db.execute(select(HiringManager).where(HiringManager.email == email))).scalar_one()
            return create_reset_token(manager)
    return asyncio.get_event_loop().run_until_complete(make())


def test_an_expired_link_is_refused(client):
    register(client, "fp6@co.com")
    token = _link_token("fp6@co.com")
    claims = jwt.get_unverified_claims(token)
    claims["exp"] = int(time.time()) - 60
    expired = jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)
    r = _reset(client, expired)
    assert r.status_code == 400
    assert r.json()["detail"] == RESET_LINK_INVALID
    # The same link, in time, works: it was the expiry that was refused.
    assert _reset(client, token).status_code == 200


def test_a_sign_in_token_is_not_a_reset_link(client):
    access, _ = register(client, "fp7@co.com")
    assert _reset(client, access).status_code == 400
    assert _reset(client, "not-a-token").status_code == 400


def test_a_reset_link_is_not_a_sign_in(client, mailbox):
    register(client, "fp8@co.com")
    _forgot(client, "fp8@co.com")
    token = _token_in(mailbox[0]["html"])
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# ── the sessions from before ──────────────────────────────────────────────────

def _refresh(client, token):
    return client.post("/api/auth/refresh", json={"refresh_token": token}).status_code


def test_a_new_password_ends_the_sessions_from_before(client, mailbox):
    register(client, "fp9@co.com")
    old = client.post("/api/auth/login", json={"email": "fp9@co.com", "password": "pw12345678"}).json()["refresh_token"]
    assert _refresh(client, old) == 200
    _forgot(client, "fp9@co.com")
    assert _reset(client, _token_in(mailbox[0]["html"])).status_code == 200
    assert _refresh(client, old) == 401
    new = client.post("/api/auth/login", json={"email": "fp9@co.com", "password": "brand-new-pass"}).json()["refresh_token"]
    assert _refresh(client, new) == 200


def test_a_session_from_before_this_check_lasts_until_it_expires(client):
    _, m = register(client, "fp10@co.com")
    from app.services.auth import create_refresh_token
    assert _refresh(client, create_refresh_token({"sub": str(m["id"])})) == 200

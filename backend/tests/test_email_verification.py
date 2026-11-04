"""Confirming a manager's email address, with a link emailed at sign-up.

Anyone could sign up with any address and email candidates from ResuMate.
"""
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from jose import jwt

from app.api.auth import VERIFY_LINK_INVALID
from app.core.config import settings
from conftest import auth_headers, register


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


def _token_in(html):
    start = html.index(f"{settings.frontend_url.rstrip('/')}/hiring/verify-email?token=")
    link = html[start:].split('"', 1)[0]
    return parse_qs(urlparse(link).query)["token"][0]


def _verify(client, token):
    return client.post("/api/auth/verify-email", json={"token": token})


def _confirmed(client, session):
    return client.get("/api/auth/me", headers=auth_headers(session)).json()["email_verified"]


# ── signing up ────────────────────────────────────────────────────────────────

def test_signing_up_emails_a_link_to_confirm_the_address(client, mailbox):
    register(client, "new@co.com", verified=False)
    assert [(m["to"], m["subject"]) for m in mailbox] == [("new@co.com", "Confirm your email for ResuMate")]
    assert _token_in(mailbox[0]["html"])


def test_without_email_the_development_answer_has_the_link(client, no_email):
    r = client.post("/api/auth/register", json={
        "name": "Mgr", "email": "dev@co.com", "password": "pw12345678", "accept_terms": True,
    })
    assert r.status_code == 201, r.text
    assert "/hiring/verify-email?token=" in r.json()["debug_verify_link"]


# ── the link ──────────────────────────────────────────────────────────────────

def test_the_link_confirms_the_address(client, mailbox):
    session, _ = register(client, "ok@co.com", verified=False)
    r = _verify(client, _token_in(mailbox[0]["html"]))
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email_verified"] is True
    assert _confirmed(client, session) is True


def test_opening_it_again_says_it_is_confirmed(client, mailbox):
    register(client, "twice@co.com", verified=False)
    token = _token_in(mailbox[0]["html"])
    assert _verify(client, token).status_code == 200
    again = _verify(client, token)
    assert again.status_code == 200, again.text
    assert again.json()["user"]["email_verified"] is True


@pytest.mark.parametrize("change", ["expired", "another kind of link", "another address", "tampered with"])
def test_a_link_that_isnt_right_is_refused(client, mailbox, change):
    session, user = register(client, "bad@co.com", verified=False)
    claims = {"sub": str(user["id"]), "type": "verify", "email": "bad@co.com",
              "exp": datetime.utcnow() + timedelta(days=1)}
    if change == "expired":
        claims["exp"] = datetime.utcnow() - timedelta(minutes=1)
    elif change == "another kind of link":
        claims["type"] = "reset"
    elif change == "another address":
        claims["email"] = "someone-else@co.com"
    token = jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)
    if change == "tampered with":
        token = token[:-6] + ("AAAAAA" if not token.endswith("AAAAAA") else "BBBBBB")
    r = _verify(client, token)
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == VERIFY_LINK_INVALID
    assert _confirmed(client, session) is False


# ── a new link ────────────────────────────────────────────────────────────────

def test_a_manager_can_ask_for_a_new_link(client, mailbox):
    session, _ = register(client, "again@co.com", verified=False)
    mailbox.clear()
    r = client.post("/api/auth/send-verification", headers=auth_headers(session))
    assert r.status_code == 200, r.text
    assert [m["to"] for m in mailbox] == ["again@co.com"]
    assert _verify(client, _token_in(mailbox[0]["html"])).status_code == 200
    assert _confirmed(client, session) is True


def test_no_new_link_is_sent_once_confirmed(client, mailbox):
    session, _ = register(client, "done@co.com")
    r = client.post("/api/auth/send-verification", headers=auth_headers(session))
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email_verified"] is True
    assert mailbox == []


def test_without_email_a_new_link_is_in_the_development_answer(client, no_email):
    session, _ = register(client, "devagain@co.com", verified=False)
    r = client.post("/api/auth/send-verification", headers=auth_headers(session))
    assert r.status_code == 200, r.text
    assert "/hiring/verify-email?token=" in r.json()["debug_verify_link"]


def test_a_new_link_needs_a_signed_in_manager(client):
    assert client.post("/api/auth/send-verification").status_code in (401, 403)

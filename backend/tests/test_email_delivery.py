"""How an email's delivery went (app/services/email_service.py, deliver): sent,
the service busy, a refusal, or email not set up.

Every failure was the same False, so nothing could tell a busy SendGrid,
worth trying again, from one that had said no.
"""
import asyncio

import pytest


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _Answer:
    def __init__(self, status_code):
        self.status_code = status_code


class _Refusal(Exception):
    """What SendGrid's client raises for an answer that isn't 2xx."""

    def __init__(self, status_code):
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


@pytest.mark.parametrize("sendgrid, outcome", [
    (lambda message: _Answer(202), "sent"),
    (lambda message: _Answer(429), "busy"),
    (lambda message: _Answer(503), "busy"),
    (lambda message: _Answer(400), "refused"),
    ("raise 500", "busy"),
    ("raise 429", "busy"),
    ("raise 403", "refused"),
    ("raise timeout", "busy"),
    ("raise unreachable", "busy"),
])
def test_a_delivery_says_how_it_went(monkeypatch, sendgrid, outcome):
    from app.services.email_service import email_service

    def send(message):
        if callable(sendgrid):
            return sendgrid(message)
        what = sendgrid.split()[1]
        if what == "timeout":
            raise TimeoutError()
        if what == "unreachable":
            raise ConnectionError("no route to host")
        raise _Refusal(int(what))

    class Client:
        pass
    client = Client()
    client.send = send
    monkeypatch.setattr(email_service, "_sg", client)
    assert _run(email_service.deliver("ada@x.com", "Hi", "<p>Hello</p>")) == outcome


def test_a_delivery_without_email_set_up_isnt_tried(monkeypatch):
    from app.services.email_service import OFF, email_service
    monkeypatch.setattr(email_service, "_sg", None)
    assert _run(email_service.deliver("ada@x.com", "Hi", "<p>Hello</p>")) == OFF

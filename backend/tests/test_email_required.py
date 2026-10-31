"""Without an email provider, every email went to the server's log in full:
sign-in codes, password-reset links and invitation links, and whom each was
for. And production ran without one, unable to sign anyone in.
"""
import asyncio

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def production(monkeypatch):
    """DEBUG off, as in production."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "debug", False)


@pytest.fixture()
def no_email(monkeypatch):
    from app.services.email_service import email_service
    monkeypatch.setattr(email_service, "_sg", None)


def test_an_email_not_sent_leaves_nothing_of_itself_in_the_log(no_email, capsys):
    from app.services.email_service import email_service
    sent = asyncio.get_event_loop().run_until_complete(email_service.send(
        "dana@x.com", "Your code for Acme", "<p>Your code is 482913, or open https://app.test/reset?token=abc</p>",
    ))
    assert sent is False
    logged = capsys.readouterr().out
    assert "not sent" in logged
    for kept in ("dana@x.com", "Acme", "482913", "token=abc"):
        assert kept not in logged


def test_production_does_not_start_without_email(production, no_email):
    import main
    with pytest.raises(RuntimeError, match="Email isn't set up"):
        with TestClient(main.app):
            pass


def test_production_starts_with_email(production, monkeypatch):
    from app.services.email_service import email_service
    monkeypatch.setattr(email_service, "_sg", object())
    email_service.require_in_production()


def test_local_development_starts_without_email(no_email):
    from app.services.email_service import email_service
    # The tests run with DEBUG, as local development does.
    email_service.require_in_production()

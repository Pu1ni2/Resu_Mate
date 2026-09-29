"""The interview worker's shared secret and the candidate sign-in codes.

Both guard a login in their own way, so both must use the secure primitive:
a constant-time comparison for the secret, the OS's cryptographic generator for
the codes.
"""
import pytest
from fastapi import HTTPException

from app.api import auth as auth_api
from app.core.config import settings
from app.services.auth import verify_agent_token

SECRET = "test-agent-secret"  # set by conftest before the app is imported


def test_the_right_agent_secret_passes():
    verify_agent_token(SECRET)
    verify_agent_token(f"  {SECRET}\n")  # surrounding whitespace is tolerated


@pytest.mark.parametrize("token", [None, "", "test-agent-secre", SECRET + "x", "TEST-AGENT-SECRET"])
def test_a_wrong_or_missing_agent_secret_is_refused(token):
    with pytest.raises(HTTPException) as exc:
        verify_agent_token(token)
    assert exc.value.status_code == 401


def test_an_unconfigured_secret_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "agent_shared_secret", "")
    with pytest.raises(HTTPException) as exc:
        verify_agent_token(SECRET)
    assert exc.value.status_code == 503


def test_save_transcript_checks_the_secret_through_the_shared_helper(client):
    body = {"candidate_email": "nobody@example.com", "transcript": [{"role": "user", "text": "hi"}]}
    assert client.post("/api/chat/save-transcript", json=body, headers={"X-Agent-Token": "wrong"}).status_code == 401
    ok = client.post("/api/chat/save-transcript", json=body, headers={"X-Agent-Token": SECRET})
    assert ok.status_code == 200 and ok.json()["saved"] is False  # right secret, no such interview


def test_sign_in_codes_come_from_secrets(monkeypatch):
    calls = []

    def fake_randbelow(n):
        calls.append(n)
        return 42

    monkeypatch.setattr(auth_api.secrets, "randbelow", fake_randbelow)
    assert auth_api._generate_otp() == "000042"  # always six digits, zero-padded
    assert calls == [10**6]


def test_sign_in_codes_are_six_digits():
    codes = {auth_api._generate_otp() for _ in range(200)}
    assert all(len(c) == 6 and c.isdigit() for c in codes)
    assert len(codes) > 150  # not stuck on a handful of values

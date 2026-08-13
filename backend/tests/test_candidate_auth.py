"""Candidate-side auth: /verify-email must not leak PII, and candidate data
must be reachable only with a candidate session token.

Regression guard for the disclosure where POST /api/chat/verify-email returned
the candidate's name, candidate_id, interview config, and the FULL interview
report + transcript to any unauthenticated caller who knew the email address.
"""
from conftest import register, auth_headers

from app.services.auth import create_candidate_token, create_access_token


def _candidate_headers(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


def _grant_access(client, manager_token, email, name="Cand"):
    """Manager creates an interview, which grants the candidate portal access."""
    r = client.post(
        "/api/chat/create-interview",
        headers=auth_headers(manager_token),
        json={
            "candidate_id": 1,
            "candidate_email": email,
            "candidate_name": name,
            "role": "Python Developer",
            "level": "Mid-Level",
            "num_questions": 5,
        },
    )
    assert r.status_code == 200, r.text
    return r


# ── /verify-email must return existence only ──────────────────────────────────

def test_verify_email_returns_no_pii(client):
    tok, _ = register(client, "mgr@co.com")
    _grant_access(client, tok, "cand@x.com", name="Jane Doe")

    r = client.post("/api/chat/verify-email", json={"email": "cand@x.com"})
    assert r.status_code == 200, r.text
    body = r.json()

    # Existence is fine to disclose; anything identifying is not.
    assert body.get("access") is True
    for leaked in ("name", "candidate_id", "interview_config", "interview_report"):
        assert leaked not in body, f"/verify-email leaked '{leaked}': {body}"

    # Belt and braces: the candidate's name must not appear anywhere in the body.
    assert "jane" not in r.text.lower()


def test_verify_email_unknown_is_false(client):
    r = client.post("/api/chat/verify-email", json={"email": "nobody@x.com"})
    assert r.status_code == 200
    assert r.json().get("access") is False


# ── Candidate endpoints require a candidate token ─────────────────────────────

def test_candidate_me_requires_token(client):
    r = client.get("/api/chat/candidate/me")
    assert r.status_code in (401, 403), r.status_code


def test_candidate_report_requires_token(client):
    r = client.get("/api/chat/candidate/my-report")
    assert r.status_code in (401, 403), r.status_code


def test_manager_token_rejected_on_candidate_route(client):
    """A hiring-manager access token must not satisfy a candidate route."""
    tok, _ = register(client, "mgr2@co.com")
    r = client.get("/api/chat/candidate/me", headers=auth_headers(tok))
    assert r.status_code == 403, r.status_code


def test_candidate_sees_own_profile(client):
    tok, _ = register(client, "mgr3@co.com")
    _grant_access(client, tok, "own@x.com", name="Own Person")

    r = client.get("/api/chat/candidate/me", headers=_candidate_headers("own@x.com"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access"] is True
    assert body["name"] == "Own Person"
    assert body["has_interview"] is True


def test_candidate_cannot_read_another_candidate(client):
    """Identity comes from the token, so a valid token for B reveals nothing about A."""
    tok, _ = register(client, "mgr4@co.com")
    _grant_access(client, tok, "victim@x.com", name="Victim")

    # Attacker holds a legitimately-issued token for a DIFFERENT address.
    r = client.get("/api/chat/candidate/me", headers=_candidate_headers("attacker@x.com"))
    assert r.status_code == 404, r.status_code
    assert "victim" not in r.text.lower()


def test_refresh_token_rejected_on_candidate_route(client):
    """Only type=candidate passes; an access token minted by hand must not."""
    forged = create_access_token({"sub": "1"})
    r = client.get("/api/chat/candidate/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 403, r.status_code

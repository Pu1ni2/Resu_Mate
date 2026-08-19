"""Auth coverage for endpoints that were previously wide open.

Each of these was reachable with no credentials at all:
  - the whole LiveKit router (mint tokens, join any room, read room config)
  - the whole advisor router (upload, LLM chat, read any candidate's context)
  - POST /api/chat/save-interview-result (overwrite any candidate's report)
"""
import io

from conftest import register, auth_headers

from app.services.auth import create_candidate_token


def _cand(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


# ── LiveKit router ────────────────────────────────────────────────────────────

def test_create_room_requires_auth(client):
    r = client.post("/api/livekit/create-room", json={
        "candidate_email": "x@x.com", "candidate_name": "X", "interview_config": {},
    })
    assert r.status_code in (401, 403), r.status_code


def test_join_room_requires_auth(client):
    r = client.post("/api/livekit/join-room", json={
        "room_name": "interview-abc123", "participant_name": "attacker",
    })
    assert r.status_code in (401, 403), r.status_code


def test_room_config_requires_agent_token(client):
    r = client.get("/api/livekit/interview-room-config/interview-abc123")
    assert r.status_code in (401, 403), r.status_code


def test_room_config_rejects_wrong_agent_token(client):
    r = client.get(
        "/api/livekit/interview-room-config/interview-abc123",
        headers={"X-Agent-Token": "not-the-secret"},
    )
    assert r.status_code == 401, r.status_code


def test_room_config_unknown_room_is_404_not_fake_config(client):
    """A missing room must 404, not hand back a generic default interview."""
    r = client.get(
        "/api/livekit/interview-room-config/interview-nope",
        headers={"X-Agent-Token": "test-agent-secret"},
    )
    assert r.status_code == 404, r.status_code
    assert "Software Engineer" not in r.text


def test_livekit_status_requires_auth(client):
    r = client.get("/api/livekit/status")
    assert r.status_code in (401, 403), r.status_code


def test_candidate_cannot_create_room_for_another_candidate(client):
    """Body email is ignored; a candidate token only ever acts on its own email."""
    tok, _ = register(client, "mgr-lk@co.com")
    client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": 1, "candidate_email": "victim@x.com",
        "candidate_name": "Victim", "role": "Dev", "level": "Mid-Level",
        "num_questions": 5,
    })
    # Attacker authenticates as themselves but names the victim in the body.
    r = client.post("/api/livekit/create-room", headers=_cand("attacker@x.com"), json={
        "candidate_email": "victim@x.com", "candidate_name": "V", "interview_config": {},
    })
    assert r.status_code == 404, r.status_code
    assert "victim" not in r.text.lower()


# ── Advisor router ────────────────────────────────────────────────────────────

def test_advisor_chat_requires_auth(client):
    r = client.post("/api/advisor/chat", json={"email": "x@x.com", "message": "hi"})
    assert r.status_code in (401, 403), r.status_code


def test_advisor_upload_requires_auth(client):
    r = client.post(
        "/api/advisor/upload-resume",
        files={"file": ("cv.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")},
        data={"email": "x@x.com"},
    )
    assert r.status_code in (401, 403), r.status_code


def test_advisor_context_requires_auth(client):
    r = client.get("/api/advisor/context")
    assert r.status_code in (401, 403), r.status_code


def test_advisor_context_by_email_path_is_gone(client):
    """The old GET /context/{email} route must no longer exist."""
    r = client.get("/api/advisor/context/victim@x.com")
    assert r.status_code != 200, "unauthenticated per-email context still reachable"


def test_advisor_upload_rejects_bad_extension(client):
    r = client.post(
        "/api/advisor/upload-resume",
        headers=_cand("c@x.com"),
        files={"file": ("evil.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")},
    )
    assert r.status_code == 400, r.status_code


# ── save-interview-result ─────────────────────────────────────────────────────

def test_save_interview_result_requires_auth(client):
    r = client.post("/api/chat/save-interview-result", json={
        "candidate_email": "victim@x.com", "report": {"score": 99},
    })
    assert r.status_code in (401, 403), r.status_code


def test_manager_token_rejected_on_save_interview_result(client):
    tok, _ = register(client, "mgr-sir@co.com")
    r = client.post("/api/chat/save-interview-result", headers=auth_headers(tok), json={
        "candidate_email": "victim@x.com", "report": {"score": 99},
    })
    assert r.status_code == 403, r.status_code


# ── /realtime ownership ───────────────────────────────────────────────────────
# checkpoint and finalize looked interviews up by id and wrote to them with no
# ownership check, so any authenticated caller could overwrite another tenant's
# transcript, or finalise their interview and trigger report generation on it,
# by passing a different integer.

def test_realtime_checkpoint_requires_auth(client):
    r = client.post("/api/realtime/checkpoint", json={"interview_id": 1, "transcript": []})
    assert r.status_code in (401, 403), r.status_code


def test_realtime_finalize_requires_auth(client):
    r = client.post("/api/realtime/finalize", json={"interview_id": 1, "transcript": []})
    assert r.status_code in (401, 403), r.status_code


def test_realtime_session_requires_auth(client):
    r = client.post("/api/realtime/session", json={"interview_id": 1, "candidate_email": "x@x.com"})
    assert r.status_code in (401, 403), r.status_code


def test_manager_cannot_checkpoint_another_tenants_interview(client):
    owner, _ = register(client, "owner-rt@co.com")
    other, _ = register(client, "other-rt@co.com")

    client.post("/api/chat/create-interview", headers=auth_headers(owner), json={
        "candidate_id": 1, "candidate_email": "cand-rt@x.com", "candidate_name": "Cand",
        "role": "Dev", "level": "Mid-Level", "num_questions": 5, "mode": "conversational",
    })

    # Sweep a range of ids: the other manager must not be able to write to any
    # of them. 404 (not found for you) is the expected answer, never 200.
    for iid in range(1, 6):
        r = client.post(
            "/api/realtime/checkpoint",
            headers=auth_headers(other),
            json={"interview_id": iid, "transcript": [{"role": "user", "text": "injected"}]},
        )
        assert r.status_code != 200, f"interview {iid} was writable by a non-owner"


def test_candidate_cannot_checkpoint_someone_elses_interview(client):
    tok, _ = register(client, "owner-rt2@co.com")
    client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": 1, "candidate_email": "victim-rt@x.com", "candidate_name": "Victim",
        "role": "Dev", "level": "Mid-Level", "num_questions": 5, "mode": "conversational",
    })
    for iid in range(1, 6):
        r = client.post(
            "/api/realtime/checkpoint",
            headers=_cand("attacker-rt@x.com"),
            json={"interview_id": iid, "transcript": [{"role": "user", "text": "injected"}]},
        )
        assert r.status_code != 200, f"interview {iid} was writable by another candidate"

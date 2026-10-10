"""Avatar interviews only when a worker can run them; voice otherwise.

Without the LiveKit worker an avatar interview's candidate waited in a room no
interviewer ever joined, and every interview defaulted to avatar.
"""
import asyncio

import pytest
from sqlalchemy import select

from conftest import auth_headers, register

from app.services.auth import create_candidate_token


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _cand(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


@pytest.fixture()
def worker(monkeypatch):
    """A server where the avatar worker is set up."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "avatar_interviews", True)
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        monkeypatch.setenv(key, "set")


def _own_candidate(client, tok, email):
    """A candidate of this manager, in the database and in memory."""
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    manager_id = client.get("/api/auth/me", headers=auth_headers(tok)).json()["id"]

    async def seed():
        async with database.async_session() as db:
            row = await db_service.create_candidate_db(db, {"name": "Cand", "email": email, "text": "resume"},
                                                       manager_id=manager_id)
            return row.id

    cid = _run(seed())
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "manager_id": manager_id, "name": "Cand", "email": email, "text": "resume", "is_resume": True,
    }
    return cid, manager_id


def _create(client, tok, cid, email, mode):
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": cid, "candidate_email": email, "candidate_name": "Cand", "role": "Dev", "mode": mode,
    })
    assert r.status_code == 200, r.text
    return r.json()


def _stored_mode(email):
    from app.core import database
    from app.models.candidate import Interview

    async def read():
        async with database.async_session() as db:
            return (await db.execute(select(Interview.mode).where(Interview.candidate_email == email))).scalar()

    return _run(read())


async def _interview(manager_id, cid, email, **fields):
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        await db_service.create_candidate_access(db, email, "Cand", cid, manager_id=manager_id)
        iv = await db_service.create_interview(db, {
            "candidate_id": cid, "manager_id": manager_id, "candidate_email": email, "role": "Dev",
            "mode": fields.pop("mode"),
        })
        for name, value in fields.items():
            setattr(iv, name, value)
        await db.commit()
        return iv.id


# ── without a worker (the default) ────────────────────────────────────────────

def test_avatar_interviews_are_off_by_default(client):
    assert client.get("/api/features").json() == {"avatar_interviews": False}


def test_a_new_avatar_interview_runs_voice_only(client):
    tok, _ = register(client, "m1@co.com")
    cid, _ = _own_candidate(client, tok, "c1@x.com")
    body = _create(client, tok, cid, "c1@x.com", "avatar")
    assert body["interview_config"]["mode"] == "conversational"
    assert _stored_mode("c1@x.com") == "conversational"


def test_an_unfinished_avatar_interview_reaches_the_candidate_as_voice(client):
    tok, _ = register(client, "m2@co.com")
    cid, mid = _own_candidate(client, tok, "c2@x.com")
    _run(_interview(mid, cid, "c2@x.com", mode="avatar"))
    me = client.get("/api/chat/candidate/me", headers=_cand("c2@x.com"))
    assert me.status_code == 200, me.text
    assert me.json()["interview_config"]["mode"] == "conversational"


def test_a_finished_avatar_interview_keeps_its_kind(client):
    tok, _ = register(client, "m3@co.com")
    cid, mid = _own_candidate(client, tok, "c3@x.com")
    _run(_interview(mid, cid, "c3@x.com", mode="avatar", status="completed"))
    statuses = client.get("/api/chat/interview-statuses", headers=auth_headers(tok)).json()["statuses"]
    assert statuses["c3@x.com"]["mode"] == "avatar"


def test_no_room_is_made_for_a_voice_only_interview(client):
    tok, _ = register(client, "m4@co.com")
    cid, mid = _own_candidate(client, tok, "c4@x.com")
    _run(_interview(mid, cid, "c4@x.com", mode="avatar"))
    r = client.post("/api/livekit/create-room", headers=_cand("c4@x.com"), json={"candidate_email": "c4@x.com"})
    assert r.status_code == 409, r.text
    assert "aren't set up" in r.json()["error"]["message"]


# ── with a worker ─────────────────────────────────────────────────────────────

def test_with_a_worker_avatar_interviews_are_offered(client, worker):
    assert client.get("/api/features").json() == {"avatar_interviews": True}
    tok, _ = register(client, "m5@co.com")
    cid, _ = _own_candidate(client, tok, "c5@x.com")
    assert _create(client, tok, cid, "c5@x.com", "avatar")["interview_config"]["mode"] == "avatar"
    assert _stored_mode("c5@x.com") == "avatar"


def test_with_a_worker_a_voice_interview_stays_voice(client, worker):
    tok, _ = register(client, "m6@co.com")
    cid, mid = _own_candidate(client, tok, "c6@x.com")
    assert _create(client, tok, cid, "c6@x.com", "conversational")["interview_config"]["mode"] == "conversational"
    r = client.post("/api/livekit/create-room", headers=_cand("c6@x.com"), json={"candidate_email": "c6@x.com"})
    assert r.status_code == 409, r.text


def test_with_a_worker_a_room_opens_without_a_name_in_the_request(client, worker, monkeypatch):
    """create_room took the candidate's name from interview.candidate when the
    request had none, and loading it lazily crashed the request."""
    from app.api import livekit_routes
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        monkeypatch.setattr(livekit_routes, key, f"test-{key.lower()}-long-enough-for-hs256")
    tok, _ = register(client, "m7@co.com")
    cid, mid = _own_candidate(client, tok, "c7@x.com")
    _run(_interview(mid, cid, "c7@x.com", mode="avatar"))
    r = client.post("/api/livekit/create-room", headers=_cand("c7@x.com"), json={"candidate_email": "c7@x.com"})
    assert r.status_code == 200, r.text
    assert r.json()["token"]

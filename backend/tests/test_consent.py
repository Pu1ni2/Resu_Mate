"""Consent: the Terms at sign-up, and the candidate's before an interview starts.

Managers signed up without agreeing to anything, and an interview began,
recorded and scored by AI, without the candidate being told so first.
"""
import asyncio

import httpx
import pytest
from sqlalchemy import select

from conftest import register

from app.api.auth import TERMS_VERSION
from app.services.auth import create_candidate_token
from app.services.consent import CONSENT_NEEDED


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _cand(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


def _manager(email):
    from app.core import database
    from app.models.auth import HiringManager

    async def read():
        async with database.async_session() as db:
            return (await db.execute(select(HiringManager).where(HiringManager.email == email))).scalar_one_or_none()
    return _run(read())


async def _interview(manager_id, email, mode):
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(db, {"name": "Cand", "email": email}, manager_id=manager_id)
        await db_service.create_candidate_access(db, email, "Cand", cand.id, manager_id=manager_id)
        iv = await db_service.create_interview(db, {
            "candidate_id": cand.id, "manager_id": manager_id, "candidate_email": email, "role": "Dev", "mode": mode,
        })
        return iv.id


def _consented_at(interview_id):
    from app.core import database
    from app.models.candidate import Interview

    async def read():
        async with database.async_session() as db:
            return (await db.get(Interview, interview_id)).consented_at
    return _run(read())


# ── sign-up ───────────────────────────────────────────────────────────────────

def test_sign_up_needs_the_terms_agreed(client):
    r = client.post("/api/auth/register", json={"name": "M", "email": "t1@co.com", "password": "pw12345678"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Please agree to the Terms and the Privacy Policy to sign up."
    assert _manager("t1@co.com") is None


def test_the_agreement_is_kept_with_its_version(client):
    register(client, "t2@co.com")
    manager = _manager("t2@co.com")
    assert manager.terms_accepted_at is not None
    assert manager.terms_version == TERMS_VERSION


# ── a voice interview ─────────────────────────────────────────────────────────

@pytest.fixture()
def openai(monkeypatch):
    """OpenAI hands out a realtime session; the requests are counted."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    asked = []

    def handler(request):
        asked.append(request.url.path)
        return httpx.Response(200, json={"value": "ek_test", "expires_at": 1})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    return asked


def _session(client, iid, email, **extra):
    return client.post("/api/realtime/session", headers=_cand(email),
                       json={"interview_id": iid, "candidate_email": email, **extra})


def test_a_voice_interview_does_not_start_without_consent(client, openai):
    _, m = register(client, "v1@co.com")
    iid = _run(_interview(m["id"], "v1@x.com", "conversational"))
    r = _session(client, iid, "v1@x.com")
    assert r.status_code == 400
    assert r.json()["detail"] == CONSENT_NEEDED
    assert openai == []  # nothing paid for
    assert _consented_at(iid) is None


def test_consent_starts_it_and_is_recorded(client, openai):
    _, m = register(client, "v2@co.com")
    iid = _run(_interview(m["id"], "v2@x.com", "conversational"))
    r = _session(client, iid, "v2@x.com", consent=True)
    assert r.status_code == 200, r.text
    assert r.json()["client_secret"] == "ek_test"
    first = _consented_at(iid)
    assert first is not None
    # Rejoining keeps the first time they agreed.
    assert _session(client, iid, "v2@x.com", consent=True).status_code == 200
    assert _consented_at(iid) == first


# ── an avatar interview ───────────────────────────────────────────────────────

@pytest.fixture()
def livekit(monkeypatch):
    """A server where avatar interviews are set up."""
    from app.api import livekit_routes
    from app.core.config import settings
    monkeypatch.setattr(settings, "avatar_interviews", True)
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        monkeypatch.setenv(key, "set")
        monkeypatch.setattr(livekit_routes, key, f"test-{key.lower()}-long-enough-for-hs256")


def _room(client, email, **extra):
    return client.post("/api/livekit/create-room", headers=_cand(email), json={"candidate_email": email, **extra})


def test_no_room_without_consent(client, livekit):
    _, m = register(client, "a1@co.com")
    iid = _run(_interview(m["id"], "a1@x.com", "avatar"))
    r = _room(client, "a1@x.com")
    assert r.status_code == 400
    assert r.json()["detail"] == CONSENT_NEEDED
    assert _consented_at(iid) is None


def test_consent_opens_the_room_and_is_recorded(client, livekit):
    _, m = register(client, "a2@co.com")
    iid = _run(_interview(m["id"], "a2@x.com", "avatar"))
    r = _room(client, "a2@x.com", consent=True)
    assert r.status_code == 200, r.text
    assert r.json()["token"]
    assert _consented_at(iid) is not None

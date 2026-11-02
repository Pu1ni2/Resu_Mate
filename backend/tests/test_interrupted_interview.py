"""A voice interview interrupted by a lost connection or a closed page is kept
and continued, not finished.

The room told the candidate to end the interview and start again, but ending
it completed it, with a report on part of it, and the new start was refused.
"""
import asyncio
import json

import httpx
import pytest

from conftest import register

from app.services.auth import create_candidate_token

SO_FAR = [
    {"role": "interviewer", "text": "Tell me about a project you led."},
    {"role": "candidate", "text": "I moved our billing service to events."},
]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _cand(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


async def _interview(manager_id, email, **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.flush()
        iv = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Dev",
                       mode="conversational", questions=["Tell me about a project you led.", "What would you change?"],
                       **fields)
        db.add(iv)
        await db.commit()
        return iv.id


async def _read(iid):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        iv = await db.get(Interview, iid)
        return iv.status, iv.transcript, iv.duration, iv.report


@pytest.fixture()
def openai(monkeypatch):
    """OpenAI hands out a realtime session; the sessions asked for are kept."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "realtime_max_total_minutes", 8)
    asked = []

    def handler(request):
        asked.append(json.loads(request.content)["session"])
        return httpx.Response(200, json={"value": "ek_test", "expires_at": 1})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    return asked


def test_an_interruption_keeps_the_conversation_and_does_not_finish_it(client):
    _, m = register(client, "i1@co.com")
    iid = _run(_interview(m["id"], "i1@x.com", status="in_progress"))
    r = client.post("/api/realtime/interrupt", headers=_cand("i1@x.com"),
                    json={"interview_id": iid, "transcript": SO_FAR, "duration": 150})
    assert r.status_code == 200, r.text
    status, transcript, duration, report = _run(_read(iid))
    assert (status, transcript, duration, report) == ("interrupted", SO_FAR, 150, None)


def test_the_next_session_continues_it(client, openai):
    from datetime import datetime
    _, m = register(client, "i2@co.com")
    iid = _run(_interview(m["id"], "i2@x.com", status="interrupted", transcript=SO_FAR, duration=150,
                          consented_at=datetime.utcnow()))
    r = client.post("/api/realtime/session", headers=_cand("i2@x.com"),
                    json={"interview_id": iid, "candidate_email": "i2@x.com", "consent": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["transcript"], body["elapsed_seconds"]) == (SO_FAR, 150)
    assert body["remaining_minutes"] == 6  # 8 less the 2 minutes taken
    script = openai[0]["instructions"]
    assert "CONTINUING AN INTERRUPTED INTERVIEW" in script
    assert '"conversation_so_far"' in script and "I moved our billing service to events." in script
    assert _run(_read(iid))[0] == "in_progress"


def test_a_fresh_interview_starts_with_nothing_so_far(client, openai):
    _, m = register(client, "i3@co.com")
    iid = _run(_interview(m["id"], "i3@x.com", status="pending"))
    r = client.post("/api/realtime/session", headers=_cand("i3@x.com"),
                    json={"interview_id": iid, "candidate_email": "i3@x.com", "consent": True})
    assert r.status_code == 200, r.text
    assert (r.json()["transcript"], r.json()["elapsed_seconds"]) == ([], 0)
    assert '"conversation_so_far"' not in openai[0]["instructions"]


def test_a_finished_interview_cannot_be_interrupted(client):
    _, m = register(client, "i4@co.com")
    iid = _run(_interview(m["id"], "i4@x.com", status="completed", report=json.dumps({"report": "## Final"})))
    r = client.post("/api/realtime/interrupt", headers=_cand("i4@x.com"),
                    json={"interview_id": iid, "transcript": SO_FAR})
    assert r.status_code == 409
    assert _run(_read(iid))[0] == "completed"


def test_no_one_else_can_interrupt_it(client):
    _, m = register(client, "i5@co.com")
    iid = _run(_interview(m["id"], "i5@x.com", status="in_progress"))
    r = client.post("/api/realtime/interrupt", headers=_cand("intruder@x.com"),
                    json={"interview_id": iid, "transcript": SO_FAR})
    assert r.status_code == 404
    assert _run(_read(iid))[0] == "in_progress"

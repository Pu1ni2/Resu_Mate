"""Every way an interview ends records when it finished and how long it took.

A voice interview's finalize and a video interview's save-transcript set only
the status, so most finished interviews had no finish date: the manager's list
showed "—" for them and sorted them wrongly.
"""
import asyncio
import json
from datetime import datetime, timedelta

import pytest

from conftest import register, auth_headers

from app.services.auth import create_candidate_token

AGENT = {"X-Agent-Token": "test-agent-secret"}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _interview(manager_id, email, **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.flush()
        iv = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Dev", **fields)
        db.add(iv)
        await db.commit()
        await db.refresh(iv)
        return iv.id


async def _read(iid):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        iv = await db.get(Interview, iid)
        return iv.status, iv.completed_at, iv.duration


@pytest.fixture()
def report_writer(monkeypatch):
    from app.tools.openai_tool import openai_tool

    async def write(prompt, system="", json_mode=False):
        return "## Report"
    monkeypatch.setattr(openai_tool, "structured_call", write)


def test_a_finished_voice_interview_has_its_date_and_length(client, report_writer):
    _, m = register(client, "f1@co.com")
    iid = _run(_interview(m["id"], "f1@x.com", status="in_progress", mode="conversational"))
    r = client.post("/api/realtime/finalize", headers={"Authorization": f"Bearer {create_candidate_token('f1@x.com')}"},
                    json={"interview_id": iid, "transcript": [{"role": "candidate", "text": "hello"}], "duration": 312})
    assert r.status_code == 200, r.text
    status, finished, seconds = _run(_read(iid))
    assert (status, seconds) == ("completed", 312)
    assert finished is not None


def test_a_finished_video_interview_has_its_date_and_length(client, report_writer):
    _, m = register(client, "f2@co.com")
    iid = _run(_interview(m["id"], "f2@x.com", status="in_progress", mode="avatar", room_name="interview-f2"))
    r = client.post("/api/chat/save-transcript", headers=AGENT, json={
        "candidate_email": "f2@x.com", "room_name": "interview-f2", "duration": 143,
        "transcript": [{"role": "interviewer", "text": "Hi"}, {"role": "candidate", "text": "Hello"}],
    })
    assert r.status_code == 200 and r.json()["saved"] is True
    status, finished, seconds = _run(_read(iid))
    assert (status, seconds) == ("completed", 143)
    assert finished is not None


def test_the_list_is_newest_first_with_undated_ones_by_when_they_were_made(client):
    tok, m = register(client, "f3@co.com")
    now = datetime.utcnow()
    done = json.dumps({"report": "## Report"})
    _run(_interview(m["id"], "yesterday@x.com", status="completed", report=done,
                    created_at=now - timedelta(days=2), completed_at=now - timedelta(days=1)))
    # Finished before every ending recorded a date: placed by when it was made.
    _run(_interview(m["id"], "undated@x.com", status="completed", report=done, created_at=now - timedelta(hours=2)))
    _run(_interview(m["id"], "today@x.com", status="completed", report=done,
                    created_at=now - timedelta(days=1), completed_at=now - timedelta(minutes=30)))
    results = client.get("/api/chat/get-all-interview-results", headers=auth_headers(tok)).json()["results"]
    assert [r["email"] for r in results] == ["today@x.com", "undated@x.com", "yesterday@x.com"]
    # No finish date is made up for it.
    assert results[1]["timestamp"] is None

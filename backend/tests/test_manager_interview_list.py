"""The manager's list of finished interviews carries each whole report.

The new Interviews view opens a report straight from this list. The list sent
the stored report column alone, but the transcript and the duration are kept
apart from it, so the manager's report showed no transcript and 0:00, and a
report kept as plain text came through as a string the view couldn't read.
"""
import asyncio
import json
from datetime import datetime

from conftest import register, auth_headers

TRANSCRIPT = [
    {"role": "interviewer", "text": "Tell me about a hard bug."},
    {"role": "candidate", "text": "A race in the payment queue."},
]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _finished(manager_id, email, **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Ada Lovelace", email=email)
        db.add(cand)
        await db.flush()
        db.add(Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Backend Engineer",
                         status="completed", completed_at=datetime.utcnow(), **fields))
        await db.commit()


def _results(client, token):
    r = client.get("/api/chat/get-all-interview-results", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()["results"]


def test_a_voice_interview_comes_with_its_transcript_and_duration(client):
    token, manager = register(client, "lists@co.com")
    _run(_finished(manager["id"], "ada@x.com", mode="conversational", report="## Summary\nClear and calm.",
                   transcript=TRANSCRIPT, duration=312))
    [result] = _results(client, token)
    report = result["report"]
    assert report["report"] == "## Summary\nClear and calm."
    assert report["transcript"] == TRANSCRIPT
    assert report["timer"] == 312 and report["duration"] == 312
    assert result["candidate_name"] == "Ada Lovelace"


def test_what_the_report_already_held_is_kept(client):
    token, manager = register(client, "keeps@co.com")
    stored = {"report": "## Summary", "violations": 1, "eyeContact": 82}
    _run(_finished(manager["id"], "grace@x.com", mode="avatar", report=json.dumps(stored), duration=95))
    [result] = _results(client, token)
    report = result["report"]
    assert report["report"] == "## Summary"
    assert report["violations"] == 1 and report["eyeContact"] == 82
    assert report["timer"] == 95
    assert report["transcript"] == []

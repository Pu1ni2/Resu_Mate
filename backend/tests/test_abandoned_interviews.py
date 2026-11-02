"""Interviews started and left are finished, on what was said.

One closed mid-session or interrupted and never continued stayed "in
progress" or "interrupted" for good, with no report.
"""
import asyncio
import json
from datetime import datetime, timedelta

from conftest import auth_headers, register

from app.services.db_service import last_activity
from app.services.interview_report import NOT_ENOUGH


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _interview(manager_id, email, **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.flush()
        iv = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Dev",
                       mode="conversational", **fields)
        db.add(iv)
        await db.commit()
        return iv.id


async def _read(iid):
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        iv = await db.get(Interview, iid)
        return iv.status, iv.report


def _days_ago(days):
    return datetime.utcnow() - timedelta(days=days)


class _Interview:
    def __init__(self, created_at, transcript=None, consented_at=None):
        self.created_at, self.transcript, self.consented_at = created_at, transcript, consented_at


def test_the_last_activity_is_the_last_line_or_the_start():
    made = datetime(2026, 11, 1, 9, 0)
    said = datetime(2026, 11, 1, 10, 0)
    # The browser stamps its lines in milliseconds, the worker in seconds.
    browser = [{"role": "candidate", "text": "Hello", "ts": (said - datetime(1970, 1, 1)).total_seconds() * 1000}]
    worker = [{"role": "candidate", "text": "Hello", "timestamp": (said - datetime(1970, 1, 1)).total_seconds()}]
    assert last_activity(_Interview(made, browser)) == said
    assert last_activity(_Interview(made, worker)) == said
    assert last_activity(_Interview(made, [], consented_at=made + timedelta(minutes=5))) == made + timedelta(minutes=5)
    assert last_activity(_Interview(made)) == made


def test_an_interview_left_for_days_is_finished_when_the_statuses_load(client):
    tok, m = register(client, "ab1@co.com")
    left = _run(_interview(m["id"], "ab1@x.com", status="interrupted", created_at=_days_ago(3),
                           transcript=[{"role": "candidate", "text": "Hello"}]))
    assert client.get("/api/chat/interview-statuses", headers=auth_headers(tok)).status_code == 200
    status, report = _run(_read(left))
    assert status == "completed"
    assert json.loads(report)["report"] == NOT_ENOUGH  # written from what was said: too little here


def test_a_recent_one_and_one_not_started_are_left_alone(client):
    tok, m = register(client, "ab2@co.com")
    recent = _run(_interview(m["id"], "ab2@x.com", status="interrupted", created_at=_days_ago(1)))
    waiting = _run(_interview(m["id"], "ab2b@x.com", status="pending", created_at=_days_ago(10)))
    client.get("/api/chat/interview-statuses", headers=auth_headers(tok))
    assert _run(_read(recent)) == ("interrupted", None)
    assert _run(_read(waiting)) == ("pending", None)


def test_another_managers_load_finishes_none_of_them(client):
    _, a = register(client, "ab3@co.com")
    tok_b, _ = register(client, "ab4@co.com")
    left = _run(_interview(a["id"], "ab3@x.com", status="in_progress", created_at=_days_ago(3)))
    client.get("/api/chat/interview-statuses", headers=auth_headers(tok_b))
    assert _run(_read(left)) == ("in_progress", None)

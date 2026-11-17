"""Interviews started and left are finished, on what was said.

One closed mid-session or interrupted and never continued stayed "in
progress" or "interrupted" for good, with no report.
"""
import asyncio
import json
from datetime import datetime, timedelta

from conftest import register

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


def _finish_left():
    """One run of the 15-minute task (app/services/cleanup.py)."""
    from app.services import cleanup
    _run(cleanup.finish_abandoned_interviews({}))


def test_an_interview_left_for_days_is_finished_by_the_15_minute_task(client):
    _, m = register(client, "ab1@co.com")
    left = _run(_interview(m["id"], "ab1@x.com", status="interrupted", created_at=_days_ago(3),
                           transcript=[{"role": "candidate", "text": "Hello"}]))
    _finish_left()
    status, report = _run(_read(left))
    assert status == "completed"
    assert json.loads(report)["report"] == NOT_ENOUGH  # written from what was said: too little here


def test_a_recent_one_and_one_not_started_are_left_alone(client):
    _, m = register(client, "ab2@co.com")
    recent = _run(_interview(m["id"], "ab2@x.com", status="interrupted", created_at=_days_ago(1)))
    waiting = _run(_interview(m["id"], "ab2b@x.com", status="pending", created_at=_days_ago(10)))
    _finish_left()
    assert _run(_read(recent)) == ("interrupted", None)
    assert _run(_read(waiting)) == ("pending", None)


def test_one_run_finishes_every_managers_left_interviews(client):
    # Each manager's waited for that manager to open the interviews page.
    _, a = register(client, "ab3@co.com")
    _, b = register(client, "ab4@co.com")
    left_a = _run(_interview(a["id"], "ab3@x.com", status="in_progress", created_at=_days_ago(3)))
    left_b = _run(_interview(b["id"], "ab4@x.com", status="interrupted", created_at=_days_ago(5)))
    _finish_left()
    assert [_run(_read(left))[0] for left in (left_a, left_b)] == ["completed", "completed"]


def test_the_statuses_page_finishes_nothing_itself(client):
    # It started the AI's work after answering, for whoever opened it.
    from conftest import auth_headers
    tok, m = register(client, "ab5@co.com")
    left = _run(_interview(m["id"], "ab5@x.com", status="in_progress", created_at=_days_ago(3)))
    assert client.get("/api/chat/interview-statuses", headers=auth_headers(tok)).status_code == 200
    assert _run(_read(left)) == ("in_progress", None)


def test_no_database_connection_is_held_while_a_report_is_written(client, monkeypatch):
    # The AI can take a minute; the connection held all that time was one
    # of the few the pool has, kept from every request.
    from app.core import database
    from app.services import interview_report
    held = []

    async def write_report(transcript, role):
        held.append(database.engine.sync_engine.pool.checkedout())
        return "## A report"
    monkeypatch.setattr(interview_report, "write_report", write_report)
    _, m = register(client, "ab6@co.com")
    left = _run(_interview(m["id"], "ab6@x.com", status="interrupted", created_at=_days_ago(3)))
    _finish_left()
    assert held == [0]
    status, report = _run(_read(left))
    assert status == "completed" and json.loads(report)["report"] == "## A report"


def test_one_its_candidate_came_back_to_meanwhile_is_left_open(client, monkeypatch):
    import time
    from app.core import database
    from app.models.candidate import Interview
    from app.services import interview_report
    _, m = register(client, "ab7@co.com")
    left = _run(_interview(m["id"], "ab7@x.com", status="interrupted", created_at=_days_ago(3)))

    async def write_report(transcript, role):
        # While the report is written, the candidate continues the interview.
        async with database.async_session() as db:
            interview = await db.get(Interview, left)
            interview.status = "in_progress"
            interview.transcript = [{"role": "candidate", "text": "I'm back", "ts": time.time() * 1000}]
            await db.commit()
        return "## A report"
    monkeypatch.setattr(interview_report, "write_report", write_report)
    _finish_left()
    assert _run(_read(left)) == ("in_progress", None)

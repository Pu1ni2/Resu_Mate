"""Who may write an interview's result, and what survives when several do.

Three parties write Interview.report: the manager's scoring path, the interview
worker and the candidate's own browser. Each used to replace the whole value,
the manager path looked interviews up by email alone, and the candidate could
post their own scores or reopen a finished interview.
"""
import asyncio
import json

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
    from app.services.db_service import report_dict
    async with database.async_session() as db:
        iv = await db.get(Interview, iid)
        return {"status": iv.status, "report": report_dict(iv.report), "scores": iv.scores, "transcript": iv.transcript}


def _cand(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


# ── the manager's scoring path ────────────────────────────────────────────────

def test_a_manager_cannot_write_another_managers_interview_report(client, monkeypatch):
    from app.agents.technical_agent import technical_agent

    async def fake_report(*a, **k):
        return "## Written by B"

    monkeypatch.setattr(technical_agent, "generate_report", fake_report)
    _, a = register(client, "ra@co.com")
    tok_b, _ = register(client, "rb@co.com")
    iid = _run(_interview(a["id"], "shared@x.com", report=json.dumps({"report": "## A's report"})))

    r = client.post("/api/chat/interview-report", headers=auth_headers(tok_b), json={
        "candidate_name": "S", "candidate_email": "shared@x.com", "role": "Dev",
        "questions": [], "answers": [], "scores": [],
    })
    assert r.status_code == 404
    assert _run(_read(iid))["report"]["report"] == "## A's report"


def test_a_manager_scores_their_own_interview_and_keeps_the_proctoring(client, monkeypatch):
    from app.agents.technical_agent import technical_agent

    async def fake_report(*a, **k):
        return "## Scored"

    monkeypatch.setattr(technical_agent, "generate_report", fake_report)
    tok, m = register(client, "rc@co.com")
    iid = _run(_interview(m["id"], "own@x.com", report=json.dumps({"violations": 2})))
    r = client.post("/api/chat/interview-report", headers=auth_headers(tok), json={
        "candidate_name": "O", "candidate_email": "own@x.com", "role": "Dev",
        "questions": ["q"], "answers": ["a"], "scores": [{"score": 8}],
    })
    assert r.status_code == 200
    saved = _run(_read(iid))
    assert saved["status"] == "completed"
    assert saved["report"]["report"] == "## Scored" and saved["report"]["violations"] == 2


# ── the candidate's browser ───────────────────────────────────────────────────

def test_a_candidate_can_record_proctoring_but_not_their_result(client):
    _, m = register(client, "rd@co.com")
    iid = _run(_interview(m["id"], "cand@x.com", status="pending",
                          report=json.dumps({"report": "## Real report"}), scores=[{"score": 4}]))
    r = client.post("/api/chat/save-interview-result", headers=_cand("cand@x.com"), json={
        "candidate_email": "cand@x.com",
        "report": {"report": "## I was brilliant", "scores": [{"score": 10}], "avgScore": 10,
                   "violations": 1, "eyeContact": 88.5, "timer": 300, "terminated": False, "lookAwayCount": 3},
    })
    assert r.status_code == 200
    saved = _run(_read(iid))
    assert saved["report"]["report"] == "## Real report"
    assert "avgScore" not in saved["report"] and saved["scores"] == [{"score": 4}]
    assert saved["report"]["violations"] == 1 and saved["report"]["eyeContact"] == 88.5
    assert saved["status"] == "pending"  # only the interviewer completes it


def test_proctoring_numbers_are_recorded_once(client):
    _, m = register(client, "re@co.com")
    iid = _run(_interview(m["id"], "once@x.com"))
    post = lambda n: client.post("/api/chat/save-interview-result", headers=_cand("once@x.com"),
                                 json={"candidate_email": "once@x.com", "report": {"violations": n}})
    post(3)
    post(0)  # a second post can't lower the count
    assert _run(_read(iid))["report"]["violations"] == 3


def test_a_terminated_interview_is_completed_with_a_server_note(client):
    _, m = register(client, "rf@co.com")
    iid = _run(_interview(m["id"], "term@x.com"))
    client.post("/api/chat/save-interview-result", headers=_cand("term@x.com"),
                json={"candidate_email": "term@x.com", "report": {"violations": 3, "terminated": True}})
    saved = _run(_read(iid))
    assert saved["status"] == "completed"
    assert saved["report"]["report"].startswith("## Interview Terminated")


# ── the interview worker ──────────────────────────────────────────────────────

def test_the_worker_writes_the_interview_in_its_room_and_keeps_proctoring(client, monkeypatch):
    from app.tools.openai_tool import openai_tool

    async def agent_report(prompt, system="", json_mode=False):
        return "## Agent report"

    monkeypatch.setattr(openai_tool, "structured_call", agent_report)
    _, a = register(client, "rg@co.com")
    _, b = register(client, "rh@co.com")
    in_room = _run(_interview(a["id"], "both@x.com", room_name="interview-a", report=json.dumps({"violations": 1})))
    newer = _run(_interview(b["id"], "both@x.com", room_name="interview-b"))

    r = client.post("/api/chat/save-transcript", headers=AGENT, json={
        "candidate_email": "both@x.com", "room_name": "interview-a",
        "transcript": [{"role": "user", "text": "hello"}],
    })
    assert r.status_code == 200 and r.json()["saved"] is True
    saved = _run(_read(in_room))
    assert saved["transcript"] == [{"role": "user", "text": "hello"}]
    assert saved["report"] == {"violations": 1, "report": "## Agent report"}
    assert _run(_read(newer))["transcript"] is None  # the other company's newer interview is untouched


# ── the conversational (Realtime) room ────────────────────────────────────────

def test_a_completed_realtime_interview_stays_completed(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")  # past the key check, to the status check
    _, m = register(client, "ri@co.com")
    iid = _run(_interview(m["id"], "rt@x.com", status="completed", mode="conversational",
                          report=json.dumps({"report": "## Final"}), transcript=[{"role": "user", "text": "done"}]))
    h = _cand("rt@x.com")

    assert client.post("/api/realtime/session", headers=h,
                       json={"interview_id": iid, "candidate_email": "rt@x.com"}).status_code == 409
    assert client.post("/api/realtime/checkpoint", headers=h,
                       json={"interview_id": iid, "transcript": [{"role": "user", "text": "rewritten"}]}).status_code == 409
    again = client.post("/api/realtime/finalize", headers=h,
                        json={"interview_id": iid, "transcript": [{"role": "user", "text": "rewritten"}]})
    assert again.status_code == 200 and again.json()["already_completed"] is True
    saved = _run(_read(iid))
    assert saved["transcript"] == [{"role": "user", "text": "done"}] and saved["report"]["report"] == "## Final"

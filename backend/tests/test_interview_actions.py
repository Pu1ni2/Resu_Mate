"""A manager can have a finished interview's report written again, and give
the candidate another interview.

A report that failed, because the AI couldn't be reached as the interview
ended, had no way to be written; and nothing made a new interview for a
candidate whose interview went wrong.
"""
import asyncio
import json

import pytest

from conftest import auth_headers, register

from app.services.auth import create_candidate_token

TRANSCRIPT = [{"role": "interviewer", "text": "Tell me about a project you led."},
              {"role": "candidate", "text": "I led the move of our billing service to events " * 6}]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _interview(manager_id, email, **fields):
    """An interview of a candidate in the manager's own list: its id and the candidate's."""
    from app.core import database
    from app.models.candidate import Candidate, Interview
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Ada", email=email)
        db.add(cand)
        await db.flush()
        await db_service.create_candidate_access(db, email, "Ada", cand.id, manager_id=manager_id)
        iv = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Data Engineer",
                       level="Senior", num_questions=2, focus_areas=["Kafka"], mode="conversational", **fields)
        db.add(iv)
        await db.commit()
        resume_rag.candidates.setdefault(manager_id, {})[cand.id] = {
            "id": cand.id, "manager_id": manager_id, "name": "Ada", "email": email, "text": f"Ada\n{email}",
            "is_resume": True,
        }
        return iv.id, cand.id


async def _interviews_of(email):
    from sqlalchemy import select
    from app.core import database
    from app.models.candidate import Interview
    from app.services.db_service import report_dict
    async with database.async_session() as db:
        rows = (await db.execute(select(Interview).where(Interview.candidate_email == email)
                                 .order_by(Interview.id))).scalars().all()
        return [(iv.id, iv.status, iv.role, iv.questions, report_dict(iv.report).get("report")) for iv in rows]


@pytest.fixture()
def ai(monkeypatch):
    """The AI writes "## Report", and makes the questions."""
    from app.agents.technical_agent import technical_agent
    from app.tools.openai_tool import openai_tool

    async def write(prompt, system="", json_mode=False):
        return "## Report"

    async def generate_smart_questions(*args, **kwargs):
        return {"questions": ["How do you size partitions?", "Tell me about a hard bug."], "resume_intelligence": {}}
    monkeypatch.setattr(openai_tool, "structured_call", write)
    monkeypatch.setattr(technical_agent, "generate_smart_questions", generate_smart_questions)


# ── the report, written again ─────────────────────────────────────────────────

def test_a_failed_report_can_be_written_again(client, ai):
    tok, m = register(client, "a1@co.com")
    iid, _ = _run(_interview(m["id"], "a1@x.com", status="completed", transcript=TRANSCRIPT))
    r = client.post(f"/api/chat/interviews/{iid}/report", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert r.json()["report"]["report"] == "## Report"
    assert _run(_interviews_of("a1@x.com"))[0][4] == "## Report"


def test_only_a_finished_interview_of_the_managers_own(client, ai):
    tok, m = register(client, "a2@co.com")
    tok_b, _ = register(client, "a3@co.com")
    waiting, _ = _run(_interview(m["id"], "a2@x.com", status="pending"))
    finished, _ = _run(_interview(m["id"], "a2b@x.com", status="completed", transcript=TRANSCRIPT))
    assert client.post(f"/api/chat/interviews/{waiting}/report", headers=auth_headers(tok)).status_code == 409
    assert client.post(f"/api/chat/interviews/{finished}/report", headers=auth_headers(tok_b)).status_code == 404
    assert client.post(f"/api/chat/interviews/{waiting}/reissue", headers=auth_headers(tok)).status_code == 409
    assert client.post(f"/api/chat/interviews/{finished}/reissue", headers=auth_headers(tok_b)).status_code == 404


# ── another interview ─────────────────────────────────────────────────────────

def test_a_finished_interview_can_be_reissued(client, ai):
    tok, m = register(client, "a4@co.com")
    first, _ = _run(_interview(m["id"], "a4@x.com", status="completed", transcript=TRANSCRIPT,
                               report=json.dumps({"report": "## Round one"})))
    r = client.post(f"/api/chat/interviews/{first}/reissue", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    second = r.json()["interview_id"]
    rows = _run(_interviews_of("a4@x.com"))
    # The first stays, with its report; the second is set up as it was, with new questions.
    assert rows[0] == (first, "completed", "Data Engineer", [], "## Round one")
    assert rows[1] == (second, "pending", "Data Engineer", ["How do you size partitions?", "Tell me about a hard bug."], None)
    # And it's the one the candidate's portal offers.
    me = client.get("/api/chat/candidate/me", headers={"Authorization": f"Bearer {create_candidate_token('a4@x.com')}"})
    assert me.json()["interview_config"]["interview_id"] == second

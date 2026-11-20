"""An evaluation that wasn't written says so.

"Evaluation failed: <the error>", or "Evaluation could not be generated.",
came back as the report, with 200, and the candidate file showed it as one.
It's written by a background job now, and the request says how it went.
"""
import asyncio
from datetime import datetime, timedelta

import pytest

from conftest import auth_headers, register

from app.agents.base_agent import AgentResult
from app.agents.hr_agent import hr_agent
from app.services.resume_rag import resume_rag

FAILED = "The evaluation couldn't be completed. Please try again."


def _seed(manager_id):
    """A candidate as an upload leaves them: a row, and the same id in the store."""
    from app.core import database
    from app.models.candidate import Candidate

    async def row():
        async with database.async_session() as db:
            cand = Candidate(manager_id=manager_id, name="Ada", email="ada@x.com")
            db.add(cand)
            await db.commit()
            return cand.id
    cid = asyncio.get_event_loop().run_until_complete(row())
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "name": "Ada", "skills": ["Python"], "predicted_role": "Backend Engineer",
        "experience_level": "Mid-Level", "is_resume": True,
    }
    return cid


def _ran(**fields):
    async def run(task, context):
        return AgentResult(output=fields.get("output"), logs=[], steps=[], metrics=None,
                           success=fields.get("success", True), error=fields.get("error"))
    return run


def _evaluate(client, run_jobs, monkeypatch, run):
    """Asked for, then written by the background job, tried as often as it
    may be: the request, as its page follows it."""
    monkeypatch.setattr(hr_agent, "run", run)
    token, user = register(client, "eval-fail@x.com")
    cid = _seed(user["id"])
    r = client.post("/api/chat/hiring-agent", headers=auth_headers(token),
                    json={"candidate_id": cid, "role": "Backend Engineer"})
    assert r.status_code == 202, r.text
    soon = datetime.utcnow()
    for later in (0, 15, 30):
        run_jobs(now=soon + timedelta(minutes=later))
    return client.get(f"/api/chat/evaluations/{r.json()['request_id']}", headers=auth_headers(token))


def test_a_failed_evaluation_is_a_failure_not_a_report(client, run_jobs, monkeypatch):
    r = _evaluate(client, run_jobs, monkeypatch, _ran(success=False, error="RateLimitError: quota exceeded"))
    assert (r.json()["status"], r.json()["error"], r.json()["evaluation"]) == ("failed", FAILED, None)
    assert "quota" not in r.text


def test_an_evaluation_with_no_report_written_is_a_failure(client, run_jobs, monkeypatch):
    r = _evaluate(client, run_jobs, monkeypatch, _ran(output=None))
    assert (r.json()["status"], r.json()["error"], r.json()["evaluation"]) == ("failed", FAILED, None)


def test_a_written_evaluation_is_sent_back(client, run_jobs, monkeypatch):
    r = _evaluate(client, run_jobs, monkeypatch, _ran(output="## A strong fit\n\nEvidence from the résumé."))
    assert r.json()["status"] == "done", r.text
    assert r.json()["evaluation"]["report"].startswith("## A strong fit")


@pytest.mark.asyncio
async def test_no_step_writing_a_report_gives_none_with_a_reason(monkeypatch):
    monkeypatch.setattr(hr_agent, "run", _ran(output=await hr_agent.synthesize("task", ["short"], {}, {})))
    result = await hr_agent.evaluate({"id": 1, "name": "Ada"}, role="Backend Engineer")
    assert result["report"] is None
    assert result["error"]

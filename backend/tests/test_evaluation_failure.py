"""An evaluation that wasn't written says so.

"Evaluation failed: <the error>", or "Evaluation could not be generated.",
came back as the report, with 200, and the candidate file showed it as one.
"""
import pytest

from conftest import auth_headers, register

from app.agents.base_agent import AgentResult
from app.agents.hr_agent import hr_agent
from app.services.resume_rag import resume_rag

FAILED = "The evaluation couldn't be completed. Please try again."


def _seed(manager_id):
    resume_rag.candidates.setdefault(manager_id, {})[1] = {
        "id": 1, "name": "Ada", "skills": ["Python"], "predicted_role": "Backend Engineer",
        "experience_level": "Mid-Level", "is_resume": True,
    }


def _ran(**fields):
    async def run(task, context):
        return AgentResult(output=fields.get("output"), logs=[], steps=[], metrics=None,
                           success=fields.get("success", True), error=fields.get("error"))
    return run


def _evaluate(client, monkeypatch, run):
    monkeypatch.setattr(hr_agent, "run", run)
    token, user = register(client, "eval-fail@x.com")
    _seed(user["id"])
    return client.post("/api/chat/hiring-agent", headers=auth_headers(token),
                       json={"candidate_id": 1, "role": "Backend Engineer"})


def test_a_failed_evaluation_is_a_failure_not_a_report(client, monkeypatch):
    r = _evaluate(client, monkeypatch, _ran(success=False, error="RateLimitError: quota exceeded"))
    assert r.status_code == 502
    assert r.json()["detail"] == FAILED
    assert "quota" not in r.text


def test_an_evaluation_with_no_report_written_is_a_failure(client, monkeypatch):
    r = _evaluate(client, monkeypatch, _ran(output=None))
    assert r.status_code == 502
    assert r.json()["detail"] == FAILED


def test_a_written_evaluation_is_sent_back(client, monkeypatch):
    r = _evaluate(client, monkeypatch, _ran(output="## A strong fit\n\nEvidence from the résumé."))
    assert r.status_code == 200, r.text
    assert r.json()["report"].startswith("## A strong fit")


@pytest.mark.asyncio
async def test_no_step_writing_a_report_gives_none_with_a_reason(monkeypatch):
    monkeypatch.setattr(hr_agent, "run", _ran(output=await hr_agent.synthesize("task", ["short"], {}, {})))
    result = await hr_agent.evaluate({"id": 1, "name": "Ada"}, role="Backend Engineer")
    assert result["report"] is None
    assert result["error"]

"""Role-fit evaluations are kept, to be read again.

An evaluation was only sent back, so opening another person's file, or a
refresh, lost it, and reading it again meant writing another.
"""
import asyncio

from sqlalchemy import func, select

from conftest import auth_headers, register

from app.agents.base_agent import AgentResult
from app.agents.hr_agent import hr_agent
from app.services import evaluations
from app.services.resume_rag import resume_rag


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _stored_candidate(manager_id, name="Ada"):
    """A candidate as an upload leaves them: a row, and the same id in the store."""
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        row = Candidate(manager_id=manager_id, name=name, email=f"{name.lower()}@x.com")
        db.add(row)
        await db.commit()
        cid = row.id
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "name": name, "skills": ["Python"], "predicted_role": "Backend Engineer",
        "experience_level": "Mid-Level", "is_resume": True,
    }
    return cid


async def _kept_count(**where):
    from app.core import database
    from app.models.evaluation import CandidateEvaluation
    async with database.async_session() as db:
        clauses = [getattr(CandidateEvaluation, k) == v for k, v in where.items()]
        return (await db.execute(select(func.count()).select_from(CandidateEvaluation).where(*clauses))).scalar()


def _writes(monkeypatch, *reports):
    """The agent writes these reports, one per evaluation."""
    queue = list(reports)

    async def run(task, context):
        return AgentResult(output=queue.pop(0), logs=[], steps=[], metrics=None, success=True)
    monkeypatch.setattr(hr_agent, "run", run)


def _evaluate(client, token, cid, **body):
    r = client.post("/api/chat/hiring-agent", headers=auth_headers(token),
                    json={"candidate_id": cid, "role": "Backend Engineer", **body})
    assert r.status_code == 200, r.text
    return r.json()


def _kept(client, token, cid):
    r = client.get(f"/api/chat/candidates/{cid}/evaluations", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()["evaluations"]


def test_a_written_evaluation_is_kept_with_what_it_was_asked(client, monkeypatch):
    _writes(monkeypatch, "## A strong fit\n\nEvidence from the résumé.")
    token, user = register(client, "kept@x.com")
    cid = _run(_stored_candidate(user["id"]))
    answer = _evaluate(client, token, cid, level="Senior", experience_required="5-8 years",
                       job_description="We want a backend engineer.", anonymize=True)
    assert answer["report"].startswith("## A strong fit")
    assert answer["evaluation_id"] and answer["created_at"]
    [kept] = _kept(client, token, cid)
    assert kept["evaluation_id"] == answer["evaluation_id"]
    assert kept["created_at"] == answer["created_at"]
    assert (kept["role"], kept["level"], kept["experience_required"]) == ("Backend Engineer", "Senior", "5-8 years")
    assert kept["job_description"] == "We want a backend engineer."
    assert kept["anonymized"] is True
    assert kept["report"] == answer["report"]


def test_they_are_listed_newest_first_and_only_the_newest_kept(client, monkeypatch):
    monkeypatch.setattr(evaluations, "KEPT_PER_CANDIDATE", 2)
    _writes(monkeypatch, "first " * 30, "second " * 30, "third " * 30, "theirs " * 30)
    token, user = register(client, "newest@x.com")
    cid = _run(_stored_candidate(user["id"]))
    other = _run(_stored_candidate(user["id"], name="Bea"))
    for _ in range(3):
        _evaluate(client, token, cid)
    _evaluate(client, token, other)
    assert [e["report"].split()[0] for e in _kept(client, token, cid)] == ["third", "second"]
    # Another candidate's don't count towards them.
    assert [e["report"].split()[0] for e in _kept(client, token, other)] == ["theirs"]


def test_another_manager_reads_none_of_them(client, monkeypatch):
    _writes(monkeypatch, "A report " * 20)
    token, user = register(client, "mine@x.com")
    cid = _run(_stored_candidate(user["id"]))
    _evaluate(client, token, cid)
    other_token, _ = register(client, "theirs@x.com")
    assert _kept(client, other_token, cid) == []


def test_an_evaluation_of_data_the_page_sent_is_not_kept(client, monkeypatch):
    _writes(monkeypatch, "A report " * 20)
    token, user = register(client, "adhoc@x.com")
    answer = _evaluate(client, token, 99, candidate_data={"id": 99, "name": "Pasted", "skills": []})
    assert answer["report"] and answer["evaluation_id"] is None
    assert _run(_kept_count(manager_id=user["id"])) == 0


def test_an_evaluation_that_cannot_be_kept_is_still_answered(client, monkeypatch):
    _writes(monkeypatch, "A report " * 20)
    token, user = register(client, "unkept@x.com")
    # In the store, with no row behind it, so the evaluation can't be filed.
    resume_rag.candidates.setdefault(user["id"], {})[5] = {"id": 5, "name": "Ada", "skills": [], "is_resume": True}
    answer = _evaluate(client, token, 5)
    assert answer["report"] and answer["evaluation_id"] is None


def test_a_pasted_job_description_is_kept_to_a_length(client, monkeypatch):
    _writes(monkeypatch, "A report " * 20)
    token, user = register(client, "long@x.com")
    cid = _run(_stored_candidate(user["id"]))
    _evaluate(client, token, cid, job_description="x" * (evaluations.MAX_JOB_DESCRIPTION + 500))
    assert len(_kept(client, token, cid)[0]["job_description"]) == evaluations.MAX_JOB_DESCRIPTION


def test_deleting_the_candidate_deletes_their_evaluations(client, monkeypatch):
    _writes(monkeypatch, "A report " * 20)
    token, user = register(client, "gone@x.com")
    cid = _run(_stored_candidate(user["id"]))
    _evaluate(client, token, cid)
    r = client.delete(f"/api/candidates/{cid}", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    assert _run(_kept_count(candidate_id=cid)) == 0


def test_deleting_the_account_deletes_its_evaluations(client, monkeypatch):
    _writes(monkeypatch, "A report " * 20)
    token, user = register(client, "account@x.com")
    cid = _run(_stored_candidate(user["id"]))
    _evaluate(client, token, cid)
    r = client.post("/api/auth/delete-account", headers=auth_headers(token), json={"password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert _run(_kept_count(manager_id=user["id"])) == 0

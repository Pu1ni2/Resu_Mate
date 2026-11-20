"""Role-fit evaluations, each asked for kept and written by a background job
(app/models/evaluation.py, app/services/evaluations.py).

An evaluation was written inside the request: a minute or more, lost when the
page closed, and a failure was gone with it.
"""
import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _candidate(manager_id, name="Ada", email="ada@x.com", **fields):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name=name, email=email, full_text=f"{name}\n{email}", **fields)
        db.add(cand)
        await db.commit()
        return cand.id


async def _asked(manager_id, candidate_id, **fields):
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    async with database.async_session() as db:
        request = EvaluationRequest(**{"manager_id": manager_id, "candidate_id": candidate_id, "role": "Dev", **fields})
        db.add(request)
        await db.commit()
        return request.id


async def _requests():
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    async with database.async_session() as db:
        return sorted((r.manager_id, r.candidate_id) for r in (await db.execute(select(EvaluationRequest))).scalars())


# ── the table ─────────────────────────────────────────────────────────────────

def test_an_evaluation_asked_for_waits_its_turn(client):
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    _, m = register(client, "er1@co.com")
    request_id = _run(_asked(m["id"], _run(_candidate(m["id"]))))

    async def read():
        async with database.async_session() as db:
            request = await db.get(EvaluationRequest, request_id)
            return (request.status, request.error, request.evaluation_id, request.anonymized,
                    request.finished_at is None, request.created_at is not None)
    assert _run(read()) == ("pending", None, None, False, True, True)


def test_deleting_an_account_deletes_the_evaluations_it_asked_for(client):
    tok, m = register(client, "er2@co.com")
    _, other = register(client, "er2b@co.com")
    _run(_asked(m["id"], _run(_candidate(m["id"]))))
    theirs = _run(_candidate(other["id"], "Bea", "bea@x.com"))
    _run(_asked(other["id"], theirs))
    # One of theirs asked about another's candidate, as no page asks, goes
    # with them too, leaving the candidate.
    _run(_asked(m["id"], theirs))
    r = client.post("/api/auth/delete-account", headers=auth_headers(tok), json={"password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert _run(_requests()) == [(other["id"], theirs)]


def test_deleting_a_candidate_deletes_the_evaluations_asked_of_them(client):
    tok, m = register(client, "er3@co.com")
    ada, bea = _run(_candidate(m["id"])), _run(_candidate(m["id"], "Bea", "bea@x.com"))
    _run(_asked(m["id"], ada))
    _run(_asked(m["id"], ada, status="done"))
    _run(_asked(m["id"], bea))
    r = client.delete(f"/api/candidates/{ada}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert _run(_requests()) == [(m["id"], bea)]


def test_erasing_a_person_deletes_the_evaluations_asked_of_them(client):
    from app.core import database
    from app.services.erasure import erase_person
    _, m = register(client, "er4@co.com")
    ada, bea = _run(_candidate(m["id"])), _run(_candidate(m["id"], "Bea", "bea@x.com"))
    _run(_asked(m["id"], ada))
    _run(_asked(m["id"], bea))

    async def erase():
        async with database.async_session() as db:
            await erase_person(db, "ada@x.com")
    _run(erase())
    assert _run(_requests()) == [(m["id"], bea)]


# ── the job that writes one ──────────────────────────────────────────────────

class _Agent(list):
    """The HR agent's evaluations, each asked for recorded with the database
    connections held meanwhile. `report` is what it writes, None for none,
    or a function run first that says."""
    report = "## A strong fit\n\nEvidence from the résumé."


@pytest.fixture()
def agent(monkeypatch):
    from app.agents.hr_agent import hr_agent
    from app.core import database
    calls = _Agent()

    async def evaluate(**asked):
        calls.append({"held": database.engine.sync_engine.pool.checkedout(), **asked})
        report = calls.report
        if callable(report):
            report = await report()
        return {"report": report, "error": None if report else "no step wrote a report", "logs": []}
    monkeypatch.setattr(hr_agent, "evaluate", evaluate)
    return calls


async def _ask(manager_id, candidate_id, **fields):
    from app.core import database
    from app.services import evaluations
    async with database.async_session() as db:
        return (await evaluations.ask(db, manager_id=manager_id, candidate_id=candidate_id, **fields)).id


async def _request(request_id):
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    async with database.async_session() as db:
        r = await db.get(EvaluationRequest, request_id)
        return r and {"status": r.status, "error": r.error, "evaluation_id": r.evaluation_id,
                      "finished": r.finished_at is not None}


async def _kept(manager_id):
    from app.core import database
    from app.models.evaluation import CandidateEvaluation
    async with database.async_session() as db:
        rows = (await db.execute(select(CandidateEvaluation).where(CandidateEvaluation.manager_id == manager_id)
                                 .order_by(CandidateEvaluation.id))).scalars()
        return [{"id": e.id, "candidate_id": e.candidate_id, "role": e.role, "level": e.level,
                 "experience": e.experience_required, "jd": e.job_description, "anonymized": e.anonymized,
                 "report": e.report} for e in rows]


def test_the_server_registers_the_evaluation_writer():
    import main  # noqa: F401
    from app.services import jobs
    handler = jobs.handler_for("evaluation.write")
    assert (handler.lane, handler.max_attempts, handler.on_failure is not None) == ("work", 3, True)


def test_an_evaluation_asked_for_is_written_with_no_connection_held(client, run_jobs, agent):
    _, m = register(client, "er5@co.com")
    cid = _run(_candidate(m["id"]))
    rid = _run(_ask(m["id"], cid, role="Backend Engineer", level="Senior", experience_required="5-8 years",
                    job_description="We want a backend engineer.", anonymized=True))
    assert _run(_request(rid))["status"] == "pending"
    assert run_jobs() == ["done"]
    [call] = agent
    assert (call["held"], call["role"], call["level"], call["experience"], call["job_description"],
            call["anonymize"], call["ats_score"]) == (0, "Backend Engineer", "Senior", "5-8 years",
                                                      "We want a backend engineer.", True, None)
    assert call["candidate"]["id"] == cid
    [kept] = _run(_kept(m["id"]))
    assert kept == {"id": kept["id"], "candidate_id": cid, "role": "Backend Engineer", "level": "Senior",
                    "experience": "5-8 years", "jd": "We want a backend engineer.", "anonymized": True,
                    "report": _Agent.report}
    assert _run(_request(rid)) == {"status": "done", "error": None, "evaluation_id": kept["id"], "finished": True}


def test_one_the_agent_couldnt_write_is_tried_again_then_said_so(client, run_jobs, agent):
    from app.services import evaluations
    _, m = register(client, "er6@co.com")
    rid = _run(_ask(m["id"], _run(_candidate(m["id"])), role="Dev"))
    agent.report = None
    assert run_jobs() == ["retry"]
    assert _run(_request(rid))["status"] == "pending"
    soon = datetime.utcnow()
    assert run_jobs(now=soon + timedelta(minutes=15)) == ["retry"]
    assert run_jobs(now=soon + timedelta(minutes=30)) == ["failed"]
    assert _run(_request(rid)) == {"status": "failed", "error": evaluations.NOT_WRITTEN, "evaluation_id": None,
                                   "finished": True}
    assert _run(_kept(m["id"])) == [] and len(agent) == 3


def test_it_waits_while_the_resume_is_being_read(client, run_jobs, agent):
    from app.core import database
    from app.models.candidate import Candidate
    _, m = register(client, "er7@co.com")
    cid = _run(_candidate(m["id"], analysis_status="pending"))
    rid = _run(_ask(m["id"], cid, role="Dev"))
    assert run_jobs() == ["deferred"]
    assert agent == [] and _run(_request(rid))["status"] == "pending"

    async def read():
        async with database.async_session() as db:
            (await db.get(Candidate, cid)).analysis_status = "done"
            await db.commit()
    _run(read())
    assert run_jobs(now=datetime.utcnow() + timedelta(minutes=1)) == ["done"]
    assert len(agent) == 1 and _run(_request(rid))["status"] == "done"


def test_one_whose_candidate_went_meanwhile_keeps_nothing(client, run_jobs, agent):
    from app.core import database
    from app.models.candidate import Candidate
    from app.services import db_service
    _, m = register(client, "er8@co.com")
    cid = _run(_candidate(m["id"]))
    rid = _run(_ask(m["id"], cid, role="Dev"))

    async def deleted_meanwhile():
        async with database.async_session() as db:
            await db_service.delete_candidates(db, Candidate.id == cid)
            await db.commit()
        return "## Too late"
    agent.report = deleted_meanwhile
    assert run_jobs() == ["done"]
    assert _run(_kept(m["id"])) == [] and _run(_request(rid)) is None


def test_two_runs_at_once_keep_one_evaluation(client, run_jobs, agent):
    # One whose hold on the job ran out while it was still going, and the
    # one that took the job up: only the run that ends the request keeps
    # what it wrote.
    from app.services import evaluations
    _, m = register(client, "er9@co.com")
    rid = _run(_ask(m["id"], _run(_candidate(m["id"])), role="Dev"))
    other = []

    async def the_other_run_first():
        if not other:
            other.append(rid)
            await evaluations.write_evaluation({"request_id": rid})
        return "## Written twice"
    agent.report = the_other_run_first
    assert run_jobs() == ["done"]
    assert other == [rid] and len(agent) == 2
    [kept] = _run(_kept(m["id"]))
    assert _run(_request(rid))["evaluation_id"] == kept["id"]


def test_one_written_already_is_written_no_more(client, run_jobs, agent):
    from app.core import database
    from app.services import evaluations, jobs
    _, m = register(client, "er10@co.com")
    rid = _run(_ask(m["id"], _run(_candidate(m["id"])), role="Dev"))
    assert run_jobs() == ["done"]

    async def again():
        async with database.async_session() as db:
            await jobs.enqueue(db, evaluations.WRITE, {"request_id": rid})
            await db.commit()
    _run(again())
    assert run_jobs() == ["done"]
    assert len(agent) == 1 and len(_run(_kept(m["id"]))) == 1


def test_a_failure_after_another_run_wrote_it_leaves_it_written(client, run_jobs, agent):
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    _, m = register(client, "er11@co.com")
    rid = _run(_ask(m["id"], _run(_candidate(m["id"])), role="Dev"))
    tries = []

    async def written_elsewhere_on_the_last_try():
        tries.append(True)
        if len(tries) == 3:
            async with database.async_session() as db:
                (await db.get(EvaluationRequest, rid)).status = "done"
                await db.commit()
        return None
    agent.report = written_elsewhere_on_the_last_try
    soon = datetime.utcnow()
    assert run_jobs() + run_jobs(now=soon + timedelta(minutes=15)) + run_jobs(now=soon + timedelta(minutes=30)) == [
        "retry", "retry", "failed"]
    assert (_run(_request(rid))["status"], _run(_request(rid))["error"]) == ("done", None)


def test_what_it_was_asked_is_kept_to_size(client, run_jobs, agent):
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    from app.services import evaluations
    _, m = register(client, "er12@co.com")
    rid = _run(_ask(m["id"], _run(_candidate(m["id"])), role="R" * 300, level="L" * 80, experience_required="E" * 80,
                    job_description="J" * (evaluations.MAX_JOB_DESCRIPTION + 10)))

    async def read():
        async with database.async_session() as db:
            r = await db.get(EvaluationRequest, rid)
            return len(r.role), len(r.level), len(r.experience_required), len(r.job_description)
    assert _run(read()) == (200, 50, 50, evaluations.MAX_JOB_DESCRIPTION)


# ── following one ────────────────────────────────────────────────────────────

def _followed(client, token, request_id, status=200):
    r = client.get(f"/api/chat/evaluations/{request_id}", headers=auth_headers(token))
    assert r.status_code == status, r.text
    return r.json()


def test_one_asked_for_is_followed_until_it_is_written(client, run_jobs, agent):
    token, m = register(client, "er13@co.com")
    cid = _run(_candidate(m["id"]))
    rid = _run(_ask(m["id"], cid, role="Dev", level="Senior", anonymized=True))
    assert _followed(client, token, rid) == {
        "request_id": rid, "candidate_id": cid, "status": "pending", "error": None, "role": "Dev",
        "level": "Senior", "anonymized": True, "evaluation": None}
    run_jobs()
    said = _followed(client, token, rid)
    [kept] = _run(_kept(m["id"]))
    assert (said["status"], said["error"]) == ("done", None)
    assert (said["evaluation"]["evaluation_id"], said["evaluation"]["report"], said["evaluation"]["role"]) == (
        kept["id"], _Agent.report, "Dev")


def test_one_that_couldnt_be_written_says_why(client, run_jobs, agent):
    from app.services import evaluations
    token, m = register(client, "er14@co.com")
    rid = _run(_ask(m["id"], _run(_candidate(m["id"])), role="Dev"))
    agent.report = None
    soon = datetime.utcnow()
    run_jobs()
    run_jobs(now=soon + timedelta(minutes=15))
    run_jobs(now=soon + timedelta(minutes=30))
    said = _followed(client, token, rid)
    assert (said["status"], said["error"], said["evaluation"]) == ("failed", evaluations.NOT_WRITTEN, None)


def test_only_the_managers_own_is_followed(client):
    token, m = register(client, "er15@co.com")
    other_token, _ = register(client, "er15b@co.com")
    rid = _run(_asked(m["id"], _run(_candidate(m["id"]))))
    _followed(client, other_token, rid, status=404)
    _followed(client, token, 99999, status=404)


def test_the_file_finds_the_one_still_being_written(client):
    token, m = register(client, "er16@co.com")
    _, other = register(client, "er16b@co.com")
    cid = _run(_candidate(m["id"]))

    def listed():
        return client.get(f"/api/chat/candidates/{cid}/evaluations", headers=auth_headers(token)).json()
    assert listed() == {"evaluations": [], "asked": None}
    # The newest of those still being written.
    _run(_asked(m["id"], cid, role="Analyst"))
    waiting = _run(_asked(m["id"], cid, role="Dev"))
    # Not one written already, though newer, nor one of another candidate's,
    # nor another manager's (as no page asks).
    _run(_asked(m["id"], cid, role="Designer", status="done"))
    _run(_asked(m["id"], _run(_candidate(m["id"], "Bea", "bea@x.com"))))
    _run(_asked(other["id"], cid))
    asked = listed()["asked"]
    assert (asked["request_id"], asked["status"], asked["role"]) == (waiting, "pending", "Dev")

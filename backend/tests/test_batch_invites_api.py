"""Batch invitations over the API: POST /api/pipeline/batches answers at once,
and GET /api/pipeline/batches/{id} follows each candidate's background job
(app/services/invite_batches.py).

The batch invite made every interview, its questions and its email inside the
request: five people took minutes, the browser gave up after two, and asking
again, or clicking Confirm twice, made every interview again.
"""
import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def no_ai(monkeypatch):
    """The questions and the drafts without the AI, each call counted."""
    from app.agents.hr_agent import hr_agent
    from app.agents.technical_agent import technical_agent
    calls = []

    async def generate_smart_questions(*args, **kwargs):
        calls.append("questions")
        return {"questions": ["Why data?"], "resume_intelligence": None}

    async def draft_email(**kwargs):
        calls.append("draft")
        return {"subject": "Interview", "body": "Hello"}
    monkeypatch.setattr(technical_agent, "generate_smart_questions", generate_smart_questions)
    monkeypatch.setattr(hr_agent, "draft_email", draft_email)
    return calls


@pytest.fixture()
def mailbox(monkeypatch):
    """A server with email set up, delivering into a list."""
    from app.services.email_service import email_service
    sent = []

    async def send(to_email, subject, html_body):
        sent.append({"to": to_email, "subject": subject})
        return True
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send", send)
    return sent


async def _candidate(manager_id, name="Ada", email="ada@x.com", **fields):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name=name, email=email, full_text=f"{name}\n{email}", **fields)
        db.add(cand)
        await db.commit()
        return cand.id


async def _count(model):
    from app.core import database
    async with database.async_session() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar()


def _start(client, tok, ids, key="confirm-0001", status=202, **fields):
    r = client.post("/api/pipeline/batches", headers=auth_headers(tok), json={
        "client_key": key, "candidate_ids": ids, "role": "Data Engineer", "mode": "conversational", **fields})
    assert r.status_code == status, r.text
    return r.json()


def _progress(client, tok, batch_id, status=200):
    r = client.get(f"/api/pipeline/batches/{batch_id}", headers=auth_headers(tok))
    assert r.status_code == status, r.text
    return r.json()


def test_a_batch_answers_at_once_and_its_jobs_do_the_rest(client, run_jobs, no_ai, mailbox):
    from app.core.config import settings
    from app.models.candidate import Interview
    tok, m = register(client, "bi1@co.com")
    ada, bo = _run(_candidate(m["id"], "Ada", "Ada@X.com")), _run(_candidate(m["id"], "Bo", "bo@x.com"))
    started = _start(client, tok, [ada, bo], send_emails=True)
    # Nothing made yet, and the AI not asked: the jobs do that.
    assert (no_ai, mailbox, _run(_count(Interview))) == ([], [], 0)
    assert (started["finished"], started["total"]) == (False, 2)
    assert [(o["candidate_id"], o["status"], o["interview_created"]) for o in started["outcomes"]] == [
        (ada, "queued", False), (bo, "queued", False)]
    assert run_jobs() == ["done", "done"]
    done = _progress(client, tok, started["batch_id"])
    assert (done["finished"], done["interviews_created"], done["emails_sent"], done["skipped"]) == (True, 2, 2, 0)
    assert done["portal_link"] == settings.candidate_login_url
    first = done["outcomes"][0]
    assert {key: first[key] for key in ("candidate_id", "name", "email", "status", "reused", "interview_created",
                                        "mode", "email_subject", "email_body", "email_drafted", "email_sent")} == {
        "candidate_id": ada, "name": "Ada", "email": "ada@x.com", "status": "done", "reused": False,
        "interview_created": True, "mode": "conversational", "email_subject": "Interview", "email_body": "Hello",
        "email_drafted": True, "email_sent": True}
    assert isinstance(first["interview_id"], int) and isinstance(first["item_id"], int)
    assert sorted(mail["to"] for mail in mailbox) == ["ada@x.com", "bo@x.com"]


def test_asking_again_with_the_same_key_is_the_same_batch(client, run_jobs, no_ai):
    from app.models.candidate import Interview
    from app.models.invite_batch import InviteBatch, InviteBatchItem
    from app.models.job import Job
    tok, m = register(client, "bi2@co.com")
    ada = _run(_candidate(m["id"]))
    first = _start(client, tok, [ada])
    # A second click, or a retry: whatever it says, it's the batch the first made.
    again = _start(client, tok, [ada], role="Analyst")
    assert again["batch_id"] == first["batch_id"]
    assert [_run(_count(model)) for model in (InviteBatch, InviteBatchItem, Job)] == [1, 1, 1]
    run_jobs()
    # Another Confirm is another batch, and the interview it made is the one.
    other = _start(client, tok, [ada], key="confirm-0002")
    run_jobs()
    outcome = _progress(client, tok, other["batch_id"])["outcomes"][0]
    assert (outcome["reused"], outcome["interview_created"]) == (True, True)
    assert _run(_count(Interview)) == 1


def test_two_requests_with_one_key_at_once_make_one_batch(client, monkeypatch):
    from app.models.invite_batch import InviteBatch
    from app.services import invite_batches
    tok, m = register(client, "bi2b@co.com")
    ada = _run(_candidate(m["id"]))
    first = _start(client, tok, [ada])
    # The second looked before the first was saved, so saving it is refused.
    real, looked = invite_batches.find, []

    async def too_soon(db, manager_id, **where):
        looked.append(where)
        return None if len(looked) == 1 else await real(db, manager_id, **where)
    monkeypatch.setattr(invite_batches, "find", too_soon)
    assert _start(client, tok, [ada])["batch_id"] == first["batch_id"]
    assert len(looked) == 2 and _run(_count(InviteBatch)) == 1


def test_each_candidate_is_asked_once_and_a_batch_has_a_limit(client):
    tok, m = register(client, "bi3@co.com")
    ada = _run(_candidate(m["id"]))
    assert [o["candidate_id"] for o in _start(client, tok, [ada, ada, ada])["outcomes"]] == [ada]
    # Counted once toward the limit too.
    assert len(_start(client, tok, [ada] * 101, key="confirm-0005")["outcomes"]) == 1
    assert "at least one" in _start(client, tok, [], key="confirm-0003", status=400)["detail"]
    assert "up to 100" in _start(client, tok, list(range(1, 102)), key="confirm-0004", status=400)["detail"]


def test_those_who_cant_be_invited_are_marked_at_once(client, no_ai):
    from app.models.job import Job
    from app.services import interview_setup, invite_batches
    from app.services.resume_rag import SAMPLE_RESUME_SHA256
    tok, m = register(client, "bi4@co.com")
    _, other = register(client, "bi4b@co.com")
    no_address = _run(_candidate(m["id"], "Bo", ""))
    sample = _run(_candidate(m["id"], "Sam", "sam@x.com", file_hash=SAMPLE_RESUME_SHA256))
    theirs = _run(_candidate(other["id"], "Cy", "cy@x.com"))
    started = _start(client, tok, [no_address, sample, theirs, 99999])
    assert (started["finished"], started["skipped"]) == (True, 4)
    assert [o["skipped"] for o in started["outcomes"]] == [
        invite_batches.NO_EMAIL, interview_setup.SAMPLE_NOT_INVITED, invite_batches.NOT_FOUND,
        invite_batches.NOT_FOUND]
    # Another manager's candidate stays theirs: not even the name.
    assert (started["outcomes"][2]["name"], started["outcomes"][2]["email"]) == ("", "")
    assert _run(_count(Job)) == 0


def test_a_batch_is_its_managers_only(client):
    tok, m = register(client, "bi5@co.com")
    other_tok, _ = register(client, "bi5b@co.com")
    ada = _run(_candidate(m["id"]))
    started = _start(client, tok, [ada])
    _progress(client, other_tok, started["batch_id"], status=404)
    # Keys are each manager's own: the same key from another is a batch of theirs.
    theirs = _start(client, other_tok, [ada])
    assert theirs["batch_id"] != started["batch_id"]
    assert theirs["outcomes"][0]["name"] == ""


def test_outcomes_say_why_an_interview_a_draft_or_an_email_didnt_happen(client, run_jobs, monkeypatch):
    from app.agents.hr_agent import hr_agent
    from app.services import interview_setup, invite_batches
    tok, m = register(client, "bi6@co.com")
    ada, bo = _run(_candidate(m["id"], "Ada", "ada@x.com")), _run(_candidate(m["id"], "Bo", "bo@x.com"))
    real = interview_setup.add_interview

    async def refuses_bo(db, **fields):
        if fields["email"] == "bo@x.com":
            raise IntegrityError("INSERT", {}, Exception("refused"))
        return await real(db, **fields)

    async def busy(**kwargs):
        raise RuntimeError("the AI is busy")
    monkeypatch.setattr(interview_setup, "add_interview", refuses_bo)
    monkeypatch.setattr(hr_agent, "draft_email", busy)
    # Email isn't set up on this server (tests have none).
    started = _start(client, tok, [ada, bo], send_emails=True)
    assert sorted(run_jobs()) == ["done", "failed"]
    done = _progress(client, tok, started["batch_id"])
    ada_said, bo_said = done["outcomes"]
    assert (ada_said["interview_created"], ada_said["email_drafted"], ada_said["email_error"],
            ada_said["email_sent"], ada_said["email_send_error"]) == (
        True, False, invite_batches.DRAFT_FAILED, False, invite_batches.NOT_SET_UP)
    assert (bo_said["status"], bo_said["interview_created"], bo_said["error"]) == (
        "failed", False, invite_batches.INTERVIEW_FAILED)
    assert "email_subject" not in bo_said
    assert (done["finished"], done["interviews_created"], done["emails_sent"]) == (True, 1, 0)


def test_a_candidate_gone_before_their_job_ran_is_said_so(client, run_jobs):
    from app.core import database
    from app.models.candidate import Candidate
    from app.services import invite_batches
    tok, m = register(client, "bi6b@co.com")
    ada = _run(_candidate(m["id"]))
    started = _start(client, tok, [ada])

    async def gone():
        async with database.async_session() as db:
            await db.delete(await db.get(Candidate, ada))
            await db.commit()
    _run(gone())
    assert run_jobs() == ["failed"]
    outcome = _progress(client, tok, started["batch_id"])["outcomes"][0]
    assert (outcome["status"], outcome["error"], outcome["interview_created"]) == (
        "failed", invite_batches.NOT_FOUND, False)


def test_avatar_interviews_run_as_voice_where_they_arent_set_up(client, run_jobs):
    tok, m = register(client, "bi7@co.com")
    ada = _run(_candidate(m["id"]))
    started = _start(client, tok, [ada], mode="avatar")
    run_jobs()
    assert _progress(client, tok, started["batch_id"])["outcomes"][0]["mode"] == "conversational"


def test_a_batch_needs_its_dialogs_key(client):
    tok, m = register(client, "bi8@co.com")
    ada = _run(_candidate(m["id"]))
    r = client.post("/api/pipeline/batches", headers=auth_headers(tok),
                    json={"candidate_ids": [ada], "role": "Data Engineer"})
    assert r.status_code == 422
    assert _start(client, tok, [ada], key="no spaces or slashes/", status=422)


def test_the_batch_route_that_did_it_all_in_the_request_is_gone(client, no_ai):
    from app.models.candidate import Interview
    tok, m = register(client, "bi9@co.com")
    ada = _run(_candidate(m["id"]))
    r = client.post("/api/pipeline/batch-action", headers=auth_headers(tok),
                    json={"candidate_ids": [ada], "role": "Dev"})
    assert r.status_code == 404
    assert (no_ai, _run(_count(Interview))) == ([], 0)

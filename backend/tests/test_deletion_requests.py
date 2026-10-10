"""Deletion for people never invited, and for a manager's own account.

Someone a sourcing run found, or whose résumé a manager uploaded, never gets a
portal sign-in, so they had no way to have their data erased. A manager could
empty their candidates but not delete their account.
"""
import asyncio

import pytest
from sqlalchemy import func, select

from conftest import auth_headers, register

from app.api.privacy import CODE_SENT, WRONG_CODE

PERSON = "grace@x.com"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def no_email(monkeypatch):
    """No email set up, so a DEBUG server shows the code (as send-otp does)."""
    from app.services.email_service import email_service
    monkeypatch.setattr(email_service, "_sg", None)


def _manager_id(client, tok):
    return client.get("/api/auth/me", headers=auth_headers(tok)).json()["id"]


async def _uploaded_and_sourced(manager_id, email=PERSON):
    """A résumé a manager uploaded, and a profile a sourcing run found: no invitation."""
    from app.core import database
    from app.models.sourcing import SourcedProfile, SourcingRun
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(db, {"name": "Grace", "email": email}, manager_id=manager_id)
        run = SourcingRun(manager_id=manager_id, description="Compiler engineers")
        db.add(run)
        await db.flush()
        db.add(SourcedProfile(run_id=run.id, manager_id=manager_id, source="upload", external_id=str(cand.id),
                              name="Grace", email=email.upper()))
        await db.commit()
    resume_rag.candidates.setdefault(manager_id, {})[cand.id] = {
        "id": cand.id, "manager_id": manager_id, "name": "Grace", "email": email, "text": f"Grace\n{email}",
    }
    return cand.id


def _count(model, *where):
    from app.core import database

    async def count():
        async with database.async_session() as db:
            return (await db.execute(select(func.count()).select_from(model).where(*where))).scalar()
    return _run(count())


def _ask(client, email=PERSON):
    r = client.post("/api/privacy/erasure-code", json={"email": email})
    assert r.status_code == 200, r.text
    return r.json()


def _erase(client, code, email=PERSON):
    return client.post("/api/privacy/erase", json={"email": email, "code": code})


# ── a deletion request ────────────────────────────────────────────────────────

def test_someone_never_invited_can_have_their_data_erased(client, no_email):
    from app.models.candidate import Candidate
    from app.models.sourcing import SourcedProfile
    from app.services.resume_rag import resume_rag
    tok, _ = register(client, "dr1@co.com")
    mid = _manager_id(client, tok)
    cid = _run(_uploaded_and_sourced(mid))

    asked = _ask(client)
    assert asked["message"] == CODE_SENT
    r = _erase(client, asked["debug_code"])
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "deleted", "records_removed": 1}
    assert _count(Candidate, Candidate.id == cid) == 0
    assert _count(SourcedProfile) == 0
    assert resume_rag.get_candidate(cid, manager_id=mid) is None


def test_an_unknown_address_gets_the_same_answer_and_no_code(client, no_email):
    from app.models.auth import OTPCode
    assert _ask(client, "nobody@x.com") == {"message": CODE_SENT}
    assert _count(OTPCode, OTPCode.email == "nobody@x.com") == 0


def test_a_wrong_code_deletes_nothing(client, no_email):
    from app.models.candidate import Candidate
    tok, _ = register(client, "dr2@co.com")
    _run(_uploaded_and_sourced(_manager_id(client, tok)))
    _ask(client)
    r = _erase(client, "000000")
    assert r.status_code == 400
    assert r.json()["detail"] == WRONG_CODE
    assert _count(Candidate) == 1


def test_five_wrong_guesses_use_the_code_up(client, no_email):
    from app.models.candidate import Candidate
    tok, _ = register(client, "dr3@co.com")
    _run(_uploaded_and_sourced(_manager_id(client, tok)))
    code = _ask(client)["debug_code"]
    for guess in ("111111", "222222", "333333", "444444", "555555"):
        assert _erase(client, guess).status_code == 400
    assert _erase(client, code).status_code == 400
    assert _count(Candidate) == 1


def test_a_code_works_once(client, no_email):
    tok, _ = register(client, "dr4@co.com")
    _run(_uploaded_and_sourced(_manager_id(client, tok)))
    code = _ask(client)["debug_code"]
    assert _erase(client, code).status_code == 200
    assert _erase(client, code).status_code == 400


def test_the_code_is_emailed_when_email_is_set_up(client, monkeypatch):
    from app.services.email_service import email_service
    sent = []

    async def send(to_email, subject, html_body):
        sent.append((to_email, subject, html_body))
        return True
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send", send)
    tok, _ = register(client, "dr5@co.com")
    _run(_uploaded_and_sourced(_manager_id(client, tok)))
    assert _ask(client) == {"message": CODE_SENT}  # no code in the answer
    assert [(to, subject) for to, subject, _ in sent] == [(PERSON, "Confirm deleting your ResuMate data")]


# ── a manager's own account ───────────────────────────────────────────────────

def _delete_account(client, tok, password):
    return client.post("/api/auth/delete-account", headers=auth_headers(tok), json={"password": password})


def test_the_wrong_password_deletes_nothing(client):
    from app.models.auth import HiringManager
    tok, _ = register(client, "acct1@co.com")
    r = _delete_account(client, tok, "not-the-password")
    assert r.status_code == 403
    assert _count(HiringManager, HiringManager.email == "acct1@co.com") == 1


def test_a_manager_can_delete_their_account_and_all_its_data(client):
    from app.models.auth import HiringManager
    from app.models.candidate import Candidate, CandidateAccess, Interview
    from app.models.sourcing import SourcedProfile, SourcingRun
    from app.services import db_service
    from app.core import database
    tok, _ = register(client, "acct2@co.com")
    other_tok, _ = register(client, "acct3@co.com")
    mid, other = _manager_id(client, tok), _manager_id(client, other_tok)
    cid = _run(_uploaded_and_sourced(mid))
    _run(_uploaded_and_sourced(other, email="kept@x.com"))

    async def invite():
        async with database.async_session() as db:
            await db_service.create_candidate_access(db, PERSON, "Grace", cid, manager_id=mid)
            await db_service.create_interview(db, {"candidate_id": cid, "manager_id": mid, "candidate_email": PERSON})
    _run(invite())

    r = _delete_account(client, tok, "pw12345678")
    assert r.status_code == 200, r.text
    assert client.post("/api/auth/login", json={"email": "acct2@co.com", "password": "pw12345678"}).status_code == 401
    assert _count(HiringManager, HiringManager.id == mid) == 0
    for model in (Candidate, Interview, CandidateAccess, SourcingRun, SourcedProfile):
        assert _count(model, model.manager_id == mid) == 0, model.__name__
    # The other manager's data stays.
    assert _count(Candidate, Candidate.manager_id == other) == 1
    assert _count(SourcedProfile, SourcedProfile.manager_id == other) == 1

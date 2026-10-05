"""Deleting candidates, and the id a candidate's database row is filed under.

Interviews point at their candidate through a foreign key with no cascade, so
the deletes failed on Postgres for anyone invited to an interview. And the row
was numbered apart from the in-memory store, so after a gap and a restart the
two ids drifted and a delete hit the wrong row.
"""
import asyncio

import pytest
from sqlalchemy import func, select, text

from conftest import register, auth_headers


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _candidate_with_interview(manager_id, name, email):
    """A candidate in the database and in memory, invited to an interview."""
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(db, {"name": name, "email": email}, manager_id=manager_id)
        await db_service.create_interview(db, {
            "candidate_id": cand.id, "manager_id": manager_id, "candidate_email": email, "role": "Dev",
        })
    resume_rag.candidates.setdefault(manager_id, {})[cand.id] = {
        "id": cand.id, "manager_id": manager_id, "name": name, "email": email, "text": "", "is_resume": True,
    }
    return cand.id


async def _rows(manager_id):
    """(candidates, interviews) this manager has in the database."""
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        c = (await db.execute(select(func.count()).select_from(Candidate).where(Candidate.manager_id == manager_id))).scalar()
        i = (await db.execute(select(func.count()).select_from(Interview).where(Interview.manager_id == manager_id))).scalar()
        return c, i


def test_the_test_database_enforces_foreign_keys(client):
    """Without this, every test below passes on SQLite while Postgres refuses."""
    from app.core import database

    async def setting():
        async with database.async_session() as db:
            return (await db.execute(text("PRAGMA foreign_keys"))).scalar()

    assert _run(setting()) == 1


def test_deleting_a_candidate_deletes_their_interviews(client):
    from app.services.resume_rag import resume_rag
    tok, user = register(client, "del1@co.com")
    cid = _run(_candidate_with_interview(user["id"], "Ada", "ada@x.com"))
    assert _run(_rows(user["id"])) == (1, 1)

    r = client.delete(f"/api/candidates/{cid}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert _run(_rows(user["id"])) == (0, 0)
    assert resume_rag.get_candidate(cid, manager_id=user["id"]) is None


def test_delete_all_takes_this_managers_interviews_and_no_one_elses(client):
    tok_a, a = register(client, "del2@co.com")
    _tok_b, b = register(client, "del3@co.com")
    _run(_candidate_with_interview(a["id"], "Ada", "ada@x.com"))
    _run(_candidate_with_interview(a["id"], "Grace", "grace@x.com"))
    _run(_candidate_with_interview(b["id"], "Linus", "linus@x.com"))

    r = client.delete("/api/candidates", headers=auth_headers(tok_a))
    assert r.status_code == 200, r.text
    assert _run(_rows(a["id"])) == (0, 0)
    assert _run(_rows(b["id"])) == (1, 1)


def test_erasure_takes_an_interview_filed_under_another_address(client):
    """The manager may invite a candidate at an address other than the one on
    their résumé; that interview still refers to the résumé's row."""
    from app.core import database
    from app.services import db_service
    from app.services.auth import create_candidate_token
    _tok, user = register(client, "del4@co.com")
    cid = _run(_candidate_with_interview(user["id"], "Dana", "dana@x.com"))

    async def second_invite():
        async with database.async_session() as db:
            await db_service.create_interview(db, {
                "candidate_id": cid, "manager_id": user["id"], "candidate_email": "dana.work@y.com", "role": "Dev",
            })

    _run(second_invite())
    assert _run(_rows(user["id"])) == (1, 2)  # both interviews exist to begin with
    r = client.post("/api/chat/candidate/delete-my-data",
                    headers={"Authorization": f"Bearer {create_candidate_token('dana@x.com')}"})
    assert r.status_code == 200, r.text
    assert _run(_rows(user["id"])) == (0, 0)


def test_a_failed_database_delete_leaves_the_candidate_in_place(client, monkeypatch):
    """The database goes first: when it fails, the candidate stays in the list
    instead of vanishing until the next restart brings them back."""
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    tok, user = register(client, "del5@co.com")
    cid = _run(_candidate_with_interview(user["id"], "Ada", "ada@x.com"))

    async def refuse(*a, **k):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(db_service, "delete_candidates", refuse)
    with pytest.raises(RuntimeError):
        client.delete(f"/api/candidates/{cid}", headers=auth_headers(tok))
    with pytest.raises(RuntimeError):
        client.delete("/api/candidates", headers=auth_headers(tok))
    assert resume_rag.get_candidate(cid, manager_id=user["id"]) is not None
    assert _run(_rows(user["id"])) == (1, 1)


def test_an_uploaded_candidate_keeps_their_id_in_the_database(client, monkeypatch):
    """The store hands out id 41 while the database would have numbered the
    row 1: the row must be 41, the id the frontend and the chunks use."""
    from app.core import database
    from app.models.candidate import Candidate
    from app.services.resume_rag import resume_rag
    tok, user = register(client, "del6@co.com")

    async def analysed(file_path, file_name, file_hash=None, manager_id=None):
        record = {"id": 41, "manager_id": manager_id, "name": "Ada", "email": "ada@x.com",
                  "file_name": file_name, "is_resume": True, "text": "Ada\nada@x.com"}
        resume_rag.candidates.setdefault(manager_id, {})[41] = record
        return record

    monkeypatch.setattr(resume_rag, "add_resume", analysed)
    r = client.post("/api/candidates/upload", headers=auth_headers(tok),
                    files={"file": ("ada.txt", b"Ada Lovelace, ada@x.com, engineer. " * 4, "text/plain")})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == 41

    async def stored():
        async with database.async_session() as db:
            return [row.id for row in (await db.execute(select(Candidate))).scalars().all()]

    assert _run(stored()) == [41]
    r = client.delete("/api/candidates/41", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert _run(stored()) == []


# ── what a delete takes, and what it leaves ───────────────────────────────────

async def _file(cid, manager_id, email, *, grant=False, key=None):
    """Extras for candidate `cid`: an interview filed by `manager_id`, and
    optionally that manager's portal grant and a stored-file key."""
    from app.core import database
    from app.models.candidate import Candidate
    from app.services import db_service
    async with database.async_session() as db:
        await db_service.create_interview(db, {
            "candidate_id": cid, "manager_id": manager_id, "candidate_email": email, "role": "Dev",
        })
        if grant:
            await db_service.create_candidate_access(db, email, "Cand", cid, manager_id=manager_id)
        if key:
            row = await db.get(Candidate, cid)
            row.file_object_key = key
            await db.commit()


async def _grants():
    from app.core import database
    from app.models.candidate import CandidateAccess
    async with database.async_session() as db:
        return (await db.execute(select(func.count()).select_from(CandidateAccess))).scalar()


def test_deleting_one_candidate_leaves_the_others(client):
    from app.services.resume_rag import resume_rag
    tok, user = register(client, "del7@co.com")
    ada = _run(_candidate_with_interview(user["id"], "Ada", "ada@x.com"))
    grace = _run(_candidate_with_interview(user["id"], "Grace", "grace@x.com"))

    r = client.delete(f"/api/candidates/{ada}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert _run(_rows(user["id"])) == (1, 1)
    assert resume_rag.get_candidate(grace, manager_id=user["id"]) is not None


def test_a_delete_takes_the_candidates_portal_grants(client):
    """Grants have no foreign key: one left behind kept the portal open."""
    tok, user = register(client, "del8@co.com")
    cid = _run(_candidate_with_interview(user["id"], "Ada", "ada@x.com"))
    _run(_file(cid, user["id"], "ada.personal@x.com", grant=True))
    assert _run(_grants()) == 1

    r = client.delete(f"/api/candidates/{cid}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert _run(_grants()) == 0


def test_another_managers_interview_under_the_id_stops_the_delete(client):
    """Before ids were unified, manager B's interview could be filed under
    manager A's candidate. Deleting A's candidate must not take it: the foreign
    key refuses, and nothing at all is deleted."""
    from sqlalchemy.exc import IntegrityError
    from app.services.resume_rag import resume_rag
    tok_a, a = register(client, "del9@co.com")
    _tok_b, b = register(client, "del10@co.com")
    cid = _run(_candidate_with_interview(a["id"], "Ada", "ada@x.com"))
    _run(_file(cid, b["id"], "bob@y.com"))

    with pytest.raises(IntegrityError):
        client.delete(f"/api/candidates/{cid}", headers=auth_headers(tok_a))
    assert _run(_rows(a["id"])) == (1, 1)
    assert _run(_rows(b["id"])) == (0, 1)
    assert resume_rag.get_candidate(cid, manager_id=a["id"]) is not None


def test_delete_all_takes_the_managers_interviews_filed_under_another_id(client):
    tok_a, a = register(client, "del11@co.com")
    _tok_b, b = register(client, "del12@co.com")
    _run(_candidate_with_interview(a["id"], "Ada", "ada@x.com"))
    linus = _run(_candidate_with_interview(b["id"], "Linus", "linus@x.com"))
    _run(_file(linus, a["id"], "ada.other@x.com", grant=True))  # A's, misfiled under B's candidate

    r = client.delete("/api/candidates", headers=auth_headers(tok_a))
    assert r.status_code == 200, r.text
    assert _run(_rows(a["id"])) == (0, 0)
    assert _run(_rows(b["id"])) == (1, 1)
    assert _run(_grants()) == 0


def test_deletes_remove_the_stored_resume_files(client, monkeypatch):
    from app.services.storage_service import storage_service
    removed = []
    monkeypatch.setattr(storage_service, "delete", lambda key: removed.append(key) or True)
    tok, user = register(client, "del13@co.com")
    ada = _run(_candidate_with_interview(user["id"], "Ada", "ada@x.com"))
    grace = _run(_candidate_with_interview(user["id"], "Grace", "grace@x.com"))
    _run(_file(ada, user["id"], "ada@x.com", key="resumes/ada.pdf"))
    _run(_file(grace, user["id"], "grace@x.com", key="resumes/grace.pdf"))

    assert client.delete(f"/api/candidates/{ada}", headers=auth_headers(tok)).status_code == 200
    assert removed == ["resumes/ada.pdf"]
    assert client.delete("/api/candidates", headers=auth_headers(tok)).status_code == 200
    assert removed == ["resumes/ada.pdf", "resumes/grace.pdf"]

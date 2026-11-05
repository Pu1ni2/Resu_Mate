"""The interviews' statuses say when each was made and finished.

The Interviews view had no dates at all: a queue of names with a status,
and nothing to say which invitation was a week old.
"""
import asyncio
from datetime import datetime

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _own_candidate(client, tok, email):
    """A candidate of this manager, in the database and in memory."""
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    manager_id = client.get("/api/auth/me", headers=auth_headers(tok)).json()["id"]

    async def seed():
        async with database.async_session() as db:
            row = await db_service.create_candidate_db(db, {"name": "Cand", "email": email, "text": "resume"},
                                                       manager_id=manager_id)
            return row.id

    cid = _run(seed())
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "manager_id": manager_id, "name": "Cand", "email": email, "text": "resume", "is_resume": True,
    }
    return cid, manager_id


async def _interview(manager_id, cid, email, **fields):
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        await db_service.create_candidate_access(db, email, "Cand", cid, manager_id=manager_id)
        iv = await db_service.create_interview(db, {
            "candidate_id": cid, "manager_id": manager_id, "candidate_email": email, "role": "Dev",
            "mode": "conversational",
        })
        for name, value in fields.items():
            setattr(iv, name, value)
        await db.commit()
        return iv.id


def _statuses(client, tok):
    r = client.get("/api/chat/interview-statuses", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    return r.json()["statuses"]


def test_an_invitation_says_when_it_was_made_and_not_finished(client):
    tok, _ = register(client, "dates1@co.com")
    cid, mid = _own_candidate(client, tok, "ada@x.com")
    _run(_interview(mid, cid, "ada@x.com", created_at=datetime(2026, 11, 2, 15, 4)))
    shown = _statuses(client, tok)["ada@x.com"]
    assert shown["status"] == "pending"
    assert shown["created_at"] == "2026-11-02T15:04:00"
    assert shown["completed_at"] is None


def test_a_finished_interview_says_when_it_finished(client):
    tok, _ = register(client, "dates2@co.com")
    cid, mid = _own_candidate(client, tok, "bea@x.com")
    _run(_interview(mid, cid, "bea@x.com", status="completed",
                    created_at=datetime(2026, 11, 1, 9, 0), completed_at=datetime(2026, 11, 3, 10, 30)))
    shown = _statuses(client, tok)["bea@x.com"]
    assert shown["created_at"] == "2026-11-01T09:00:00"
    assert shown["completed_at"] == "2026-11-03T10:30:00"


def test_the_newest_interview_for_an_address_is_the_one_shown(client):
    tok, _ = register(client, "dates3@co.com")
    cid, mid = _own_candidate(client, tok, "cy@x.com")
    _run(_interview(mid, cid, "cy@x.com", status="completed", created_at=datetime(2026, 10, 1, 9, 0),
                    completed_at=datetime(2026, 10, 2, 9, 0)))
    _run(_interview(mid, cid, "cy@x.com", created_at=datetime(2026, 11, 4, 8, 0)))
    shown = _statuses(client, tok)["cy@x.com"]
    assert shown["status"] == "pending"
    assert shown["created_at"] == "2026-11-04T08:00:00"

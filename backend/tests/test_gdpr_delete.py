"""GDPR erasure: a candidate can delete all their own data, and the endpoint
rejects requests without a valid candidate token.
"""
import asyncio

from conftest import register, auth_headers


def _candidate_headers(email):
    """Mint a real candidate session token (type=candidate) for this email."""
    from app.services.auth import create_candidate_token
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


async def _seed(manager_id, email):
    """Create a candidate row, an interview, and a portal-access grant."""
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(
            db, {"name": "Dana", "email": email, "is_resume": True}, manager_id=manager_id
        )
        await db_service.create_candidate_access(db, email, "Dana", cand.id, manager_id=manager_id)
        await db_service.create_interview(db, {
            "candidate_id": cand.id, "manager_id": manager_id,
            "candidate_email": email, "role": "Engineer",
        })


async def _counts(email):
    from app.core import database
    from app.models.candidate import Candidate, Interview, CandidateAccess
    from sqlalchemy import select, func
    async with database.async_session() as db:
        c = (await db.execute(select(func.count()).select_from(Candidate).where(Candidate.email == email))).scalar()
        i = (await db.execute(select(func.count()).select_from(Interview).where(Interview.candidate_email == email))).scalar()
        a = (await db.execute(select(func.count()).select_from(CandidateAccess).where(CandidateAccess.email == email))).scalar()
        return c, i, a


def test_delete_my_data_requires_candidate_token(client):
    # No token → 401.
    r = client.post("/api/chat/candidate/delete-my-data")
    assert r.status_code == 401, r.status_code

    # A hiring-manager token is the wrong type → 403.
    tok, _ = register(client, "mgr-gdpr@co.com")
    r2 = client.post("/api/chat/candidate/delete-my-data", headers=auth_headers(tok))
    assert r2.status_code == 403, r2.status_code


def test_candidate_can_erase_own_data(client):
    _tok, user = register(client, "mgr2-gdpr@co.com")
    email = "dana@x.com"
    asyncio.get_event_loop().run_until_complete(_seed(user["id"], email))

    # Precondition: data exists.
    c, i, a = asyncio.get_event_loop().run_until_complete(_counts(email))
    assert (c, i, a) == (1, 1, 1), (c, i, a)

    # Candidate erases their own data.
    r = client.post("/api/chat/candidate/delete-my-data", headers=_candidate_headers(email))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "deleted"

    # Postcondition: candidate, interview, and access rows are all gone.
    c2, i2, a2 = asyncio.get_event_loop().run_until_complete(_counts(email))
    assert (c2, i2, a2) == (0, 0, 0), (c2, i2, a2)

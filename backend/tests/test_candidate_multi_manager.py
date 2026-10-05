"""One person, invited by two companies, and ids that point at someone else.

Grants are unique per (email, manager), so the same candidate can hold two.
The portal used scalar_one_or_none() on them and returned 500s, and it loaded
a profile by bare candidate_id with no owner or identity check.
"""
import asyncio

from conftest import register, auth_headers

from app.services.auth import create_candidate_token

EMAIL = "maya@x.com"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _invite(manager_id, email, name, role, candidate_email=None, candidate_name=None):
    """A manager's own candidate row, a grant to `email`, and an interview."""
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(db, {
            "name": candidate_name or name, "email": candidate_email or email, "is_resume": True,
            "predicted_role": role,
        }, manager_id=manager_id)
        await db_service.create_candidate_access(db, email, name, cand.id, manager_id=manager_id)
        await db_service.create_interview(db, {
            "candidate_id": cand.id, "manager_id": manager_id, "candidate_email": email, "role": role,
        })
        return cand.id


def _sign_in(client, email):
    sent = client.post("/api/auth/candidate/send-otp", json={"email": email})
    assert sent.status_code == 200, sent.text
    code = sent.json()["debug_code"]  # DEBUG with no SendGrid returns the code
    r = client.post("/api/auth/candidate/verify-otp", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    return r.json()["candidate_data"]


def test_two_companies_inviting_one_person_works_end_to_end(client):
    _, a = register(client, "a@co.com")
    _, b = register(client, "b@co.com")
    _run(_invite(a["id"], EMAIL, "Maya (A)", "Backend Engineer"))
    _run(_invite(b["id"], EMAIL, "Maya (B)", "Data Engineer"))

    assert client.post("/api/chat/verify-email", json={"email": EMAIL}).json()["access"] is True

    data = _sign_in(client, EMAIL)
    # Name, interview and profile all from the same company: B, the newest.
    assert data["name"] == "Maya (B)"
    assert data["interview_config"]["mode"] == "avatar"
    assert data["profile"]["predicted_role"] == "Data Engineer"

    me = client.get("/api/chat/candidate/me", headers={"Authorization": f"Bearer {create_candidate_token(EMAIL)}"})
    assert me.status_code == 200, me.text
    assert me.json()["name"] == "Maya (B)"
    assert me.json()["interview_config"]["role"] == "Data Engineer"


def test_a_grant_pointing_at_someone_else_shows_no_profile(client):
    _, a = register(client, "a2@co.com")
    # The grant to maya@x.com points at a Candidate row that is a different person.
    _run(_invite(a["id"], EMAIL, "Maya", "Backend Engineer", candidate_email="other@x.com", candidate_name="Oscar Other"))
    data = _sign_in(client, EMAIL)
    assert data["profile"] is None
    assert data["has_interview"] is True  # the portal still works; only the stranger's profile is withheld


def test_an_invite_at_a_different_address_still_shows_the_profile(client):
    _, a = register(client, "a3@co.com")
    # The manager invited maya@x.com for a resume filed under her work address.
    _run(_invite(a["id"], EMAIL, "Maya Chen", "Backend Engineer", candidate_email="maya@work.com", candidate_name="Maya Chen"))
    assert _sign_in(client, EMAIL)["profile"]["name"] == "Maya Chen"


def test_create_interview_refuses_another_managers_candidate(client):
    from app.services.resume_rag import resume_rag
    tok_a, a = register(client, "a4@co.com")
    _, b = register(client, "b4@co.com")
    resume_rag.candidates.setdefault(b["id"], {})[7] = {"id": 7, "manager_id": b["id"], "name": "B's hire", "text": "x"}

    r = client.post("/api/chat/create-interview", headers=auth_headers(tok_a), json={
        "candidate_id": 7, "candidate_email": "attacker@x.com", "candidate_name": "B's hire", "role": "Dev",
    })
    assert r.status_code == 404
    # Nothing was written: the attacker's address has no grant to sign in with.
    assert client.post("/api/chat/verify-email", json={"email": "attacker@x.com"}).json()["access"] is False


def test_create_interview_works_for_the_managers_own_candidate(client):
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    tok_a, a = register(client, "a5@co.com")

    async def own_row():
        # In the database too: the interview refers to the row, and without one
        # it was never saved, while the endpoint still answered 200.
        async with database.async_session() as db:
            await db_service.create_candidate_db(db, {"id": 3, "name": "Own", "text": "x"}, manager_id=a["id"])

    _run(own_row())
    resume_rag.candidates.setdefault(a["id"], {})[3] = {"id": 3, "manager_id": a["id"], "name": "Own", "text": "x"}
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok_a), json={
        "candidate_id": 3, "candidate_email": "own@x.com", "candidate_name": "Own", "role": "Dev",
    })
    assert r.status_code == 200, r.text
    assert client.post("/api/chat/verify-email", json={"email": "own@x.com"}).json()["access"] is True


def test_create_interview_says_so_when_the_interview_is_not_saved(client):
    """A candidate in memory with no database row: the foreign key refuses the
    interview, and the manager must hear about it rather than get a 200."""
    from sqlalchemy import func, select
    from app.core import database
    from app.models.candidate import Interview
    from app.services.resume_rag import resume_rag
    tok_a, a = register(client, "a6@co.com")
    resume_rag.candidates.setdefault(a["id"], {})[4] = {"id": 4, "manager_id": a["id"], "name": "Ghost", "text": "x"}
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok_a), json={
        "candidate_id": 4, "candidate_email": "ghost@x.com", "candidate_name": "Ghost", "role": "Dev",
    })
    assert r.status_code == 500, r.text

    async def interviews():
        async with database.async_session() as db:
            return (await db.execute(select(func.count()).select_from(Interview))).scalar()

    assert _run(interviews()) == 0

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


async def _seed_everything_else(manager_id, email):
    """The rest of what is held under an address: advisor session, a sign-in
    code, and a sourcing run's profile of them."""
    from datetime import datetime, timedelta
    from app.core import database
    from app.models.auth import OTPCode
    from app.models.sourcing import SourcingRun, SourcedProfile
    from app.models.state import AdvisorSession
    async with database.async_session() as db:
        db.add(AdvisorSession(email=email, resume_text="my resume", chat_history={"resume_coach": []}))
        db.add(OTPCode(email=email, code="hash", expires_at=datetime.utcnow() + timedelta(minutes=10)))
        run = SourcingRun(manager_id=manager_id, description="search")
        db.add(run)
        await db.flush()
        db.add(SourcedProfile(run_id=run.id, manager_id=manager_id, source="upload", external_id="1",
                              name="Dana", email=email))
        await db.commit()


async def _counts_everything_else(email):
    from sqlalchemy import func, select
    from app.core import database
    from app.models.auth import OTPCode
    from app.models.sourcing import SourcedProfile
    from app.models.state import AdvisorSession
    async with database.async_session() as db:
        out = []
        for model in (AdvisorSession, OTPCode, SourcedProfile):
            out.append((await db.execute(select(func.count()).select_from(model).where(model.email == email))).scalar())
        return tuple(out)


def test_erasure_also_removes_advisor_sessions_codes_and_sourced_profiles(client):
    from app.api.advisor_agent import _session_cache
    _tok, user = register(client, "mgr3-gdpr@co.com")
    email = "erin@x.com"
    loop = asyncio.get_event_loop()
    loop.run_until_complete(_seed(user["id"], email))
    loop.run_until_complete(_seed_everything_else(user["id"], email))
    _session_cache[email] = {"text": "cached resume"}
    assert loop.run_until_complete(_counts_everything_else(email)) == (1, 1, 1)

    r = client.post("/api/chat/candidate/delete-my-data", headers=_candidate_headers(email))
    assert r.status_code == 200, r.text
    assert loop.run_until_complete(_counts_everything_else(email)) == (0, 0, 0)
    assert email not in _session_cache


# ── which résumés are theirs ──────────────────────────────────────────────────

async def _resume(manager_id, name, email=None, text="", in_memory=False):
    """A résumé row, optionally also in the in-memory store. Returns its id."""
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(
            db, {"name": name, "email": email, "text": text, "is_resume": True}, manager_id=manager_id
        )
    if in_memory:
        resume_rag.candidates.setdefault(manager_id, {})[cand.id] = {
            "id": cand.id, "manager_id": manager_id, "name": name, "email": email or "",
            "text": text, "is_resume": True,
        }
    return cand.id


async def _exists(cid):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        return (await db.get(Candidate, cid)) is not None


def test_erasure_finds_the_resume_whatever_the_case_of_its_address(client):
    _tok, user = register(client, "mgr4-gdpr@co.com")
    loop = asyncio.get_event_loop()
    cid = loop.run_until_complete(_resume(user["id"], "Dana Case", email="Dana.Case@X.com"))

    r = client.post("/api/chat/candidate/delete-my-data", headers=_candidate_headers("dana.case@x.com"))
    assert r.status_code == 200, r.text
    assert r.json()["records_removed"] == 1
    assert not loop.run_until_complete(_exists(cid))


def test_erasure_finds_a_resume_whose_address_is_only_in_its_text(client):
    """The portal finds a résumé by the first address in its text when the email
    column is empty, so erasure must find that one too."""
    from app.services.resume_rag import resume_rag
    _tok, user = register(client, "mgr5-gdpr@co.com")
    loop = asyncio.get_event_loop()
    cid = loop.run_until_complete(_resume(
        user["id"], "Dana Text", text="Dana Text\ndana.text@x.com\nPython developer, 6 years.", in_memory=True,
    ))
    assert [c["id"] for c in resume_rag.candidates_with_email("dana.text@x.com")] == [cid]

    r = client.post("/api/chat/candidate/delete-my-data", headers=_candidate_headers("dana.text@x.com"))
    assert r.status_code == 200, r.text
    assert not loop.run_until_complete(_exists(cid))
    assert resume_rag.candidates_with_email("dana.text@x.com") == []


def test_erasure_leaves_a_resume_that_only_mentions_the_address(client):
    _tok, user = register(client, "mgr6-gdpr@co.com")
    loop = asyncio.get_event_loop()
    own = loop.run_until_complete(_resume(user["id"], "Dana Own", email="dana.own@x.com"))
    referee = loop.run_until_complete(_resume(
        user["id"], "Ref Person", text="Ref Person\nref@y.com\nReferences: dana.own@x.com", in_memory=True,
    ))

    r = client.post("/api/chat/candidate/delete-my-data", headers=_candidate_headers("dana.own@x.com"))
    assert r.status_code == 200, r.text
    assert not loop.run_until_complete(_exists(own))
    assert loop.run_until_complete(_exists(referee))


def test_erasure_never_follows_a_wrong_id_to_someone_else(client):
    """An in-memory record under an id that, in the database, is another
    person's résumé: the in-memory record goes, the other person stays."""
    from app.services.resume_rag import resume_rag
    _tok, a = register(client, "mgr7-gdpr@co.com")
    _tok_b, b = register(client, "mgr8-gdpr@co.com")
    loop = asyncio.get_event_loop()
    other = loop.run_until_complete(_resume(b["id"], "Someone Else", email="else@y.com"))
    resume_rag.candidates.setdefault(a["id"], {})[other] = {
        "id": other, "manager_id": a["id"], "name": "Dana Drift", "email": "dana.drift@x.com",
        "text": "Dana Drift", "is_resume": True,
    }

    r = client.post("/api/chat/candidate/delete-my-data", headers=_candidate_headers("dana.drift@x.com"))
    assert r.status_code == 200, r.text
    assert loop.run_until_complete(_exists(other))
    assert resume_rag.candidates_with_email("dana.drift@x.com") == []

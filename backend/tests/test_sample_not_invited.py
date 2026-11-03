"""The sample résumé is marked, and gets no interview.

The Candidates page offers a sample résumé, Riley Samplewood's, for trying
ResuMate (tests/test_sample_resume.py). It was a candidate like any other:
counted in the figures, and invitable, to the made-up address on it.
"""
import asyncio
import hashlib
from pathlib import Path

from sqlalchemy import func, select

from conftest import auth_headers, register

from app.services.interview_setup import SAMPLE_NOT_INVITED
from app.services.resume_rag import SAMPLE_RESUME_SHA256, is_sample, resume_rag

SAMPLE = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sample-resume.pdf"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _stored(manager_id, name, email, file_hash):
    """A candidate as an upload leaves them: a row, and the same id in the store."""
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        row = Candidate(manager_id=manager_id, name=name, email=email, is_resume=True, file_hash=file_hash,
                        predicted_role="Product Designer")
        db.add(row)
        await db.commit()
        cid = row.id
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "manager_id": manager_id, "name": name, "email": email, "file_hash": file_hash,
        "text": f"{name}\n{email}\nProduct Designer", "is_resume": True, "skills": [],
        "is_sample": file_hash == SAMPLE_RESUME_SHA256,
    }
    return cid


async def _count(model, **where):
    from app.core import database
    async with database.async_session() as db:
        clauses = [getattr(model, k) == v for k, v in where.items()]
        return (await db.execute(select(func.count()).select_from(model).where(*clauses))).scalar()


def test_the_fingerprint_is_the_bundled_sample_files():
    # A sample written again (backend/scripts/make_sample_resume.py) needs it updated.
    assert hashlib.sha256(SAMPLE.read_bytes()).hexdigest() == SAMPLE_RESUME_SHA256


def test_the_sample_is_marked_in_the_list_and_no_one_else_is(client):
    token, user = register(client, "sample@x.com")
    _run(_stored(user["id"], "Riley Samplewood", "riley.samplewood@example.com", SAMPLE_RESUME_SHA256))
    _run(_stored(user["id"], "Ada", "ada@x.com", "another-file"))
    listed = {c["name"]: c["is_sample"] for c in client.get("/api/candidates", headers=auth_headers(token)).json()["candidates"]}
    assert listed == {"Riley Samplewood": True, "Ada": False}
    assert is_sample({"file_hash": SAMPLE_RESUME_SHA256}) and not is_sample({}) and not is_sample(None)


def test_the_sample_gets_no_interview_and_no_portal_access(client):
    from app.models.candidate import CandidateAccess, Interview
    token, user = register(client, "invite@x.com")
    cid = _run(_stored(user["id"], "Riley Samplewood", "riley.samplewood@example.com", SAMPLE_RESUME_SHA256))
    r = client.post("/api/chat/create-interview", headers=auth_headers(token), json={
        "candidate_id": cid, "candidate_email": "riley.samplewood@example.com",
        "candidate_name": "Riley Samplewood", "role": "Designer",
    })
    assert r.status_code == 400
    assert r.json()["detail"] == SAMPLE_NOT_INVITED
    assert _run(_count(Interview, candidate_id=cid)) == 0
    assert _run(_count(CandidateAccess, email="riley.samplewood@example.com")) == 0


def test_a_batch_skips_the_sample_and_says_why(client):
    token, user = register(client, "batch@x.com")
    cid = _run(_stored(user["id"], "Riley Samplewood", "riley.samplewood@example.com", SAMPLE_RESUME_SHA256))
    r = client.post("/api/pipeline/batch-action", headers=auth_headers(token),
                    json={"candidate_ids": [cid], "role": "Designer"})
    assert r.status_code == 200, r.text
    [outcome] = r.json()["outcomes"]
    assert outcome["interview_created"] is False
    assert outcome["skipped"] == SAMPLE_NOT_INVITED

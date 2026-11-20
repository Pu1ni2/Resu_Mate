"""A single interview's questions, written by a background job.

The interview was made with its questions inside the request: the AI wrote
them while the manager waited, and the invitation went before they were
kept.
"""
import asyncio

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _interview(manager_id, email="ada@x.com", **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Ada", email=email)
        db.add(cand)
        await db.flush()
        interview = Interview(**{"candidate_id": cand.id, "manager_id": manager_id, "candidate_email": email,
                                 "role": "Dev", "mode": "conversational", **fields})
        db.add(interview)
        await db.commit()
        return interview.id


# ── how they stand ───────────────────────────────────────────────────────────

def test_an_interview_says_how_its_questions_stand(client):
    token, m = register(client, "qj1@co.com")
    made_with_them = _run(_interview(m["id"], questions=["Why this role?"]))
    being_written = _run(_interview(m["id"], questions_status="pending"))
    not_written = _run(_interview(m["id"], questions_status="failed"))

    def said(interview_id):
        r = client.get(f"/api/chat/interviews/{interview_id}", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        return r.json()["questions_status"], r.json()["questions"]
    assert said(made_with_them) == ("ready", ["Why this role?"])
    assert said(being_written) == ("pending", [])
    assert said(not_written) == ("failed", [])

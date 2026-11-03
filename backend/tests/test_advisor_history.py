"""The advisor's conversations are shown again, and can be started over.

The advisor kept each mode's last messages and answered from them, but no
route returned them, so the portal started blank every time, and a page
cleared by hand was still answered from the old conversation.
"""
import asyncio

from app.services import state_service
from app.services.auth import create_candidate_token


def _signed_in(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _remember(email, mode, messages):
    from app.core import database
    async with database.async_session() as db:
        await state_service.update_advisor_session(db, email, mode=mode, messages=messages)


TALK = [{"role": "user", "content": "Review my resume"}, {"role": "assistant", "content": "Lead with impact."}]


def test_each_modes_conversation_is_read_back(client):
    _run(_remember("ada@x.com", "resume_coach", TALK))
    r = client.get("/api/advisor/history", headers=_signed_in("ada@x.com"))
    assert r.status_code == 200, r.text
    history = r.json()["history"]
    assert history["resume_coach"] == TALK
    assert history["general"] == [] and history["interview_prep"] == [] and history["career_advisor"] == []


def test_only_the_candidates_own_is_read(client):
    _run(_remember("ada@x.com", "general", TALK))
    r = client.get("/api/advisor/history", headers=_signed_in("bea@x.com"))
    assert r.json()["history"]["general"] == []


def test_it_needs_a_candidate_signed_in(client):
    assert client.get("/api/advisor/history").status_code in (401, 403)
    assert client.post("/api/advisor/history/clear", json={"mode": "general"}).status_code in (401, 403)


def test_anything_but_a_message_isnt_sent_back(client):
    _run(_remember("ada@x.com", "general", [{"role": "system", "content": "You are an advisor."}, "junk", *TALK]))
    r = client.get("/api/advisor/history", headers=_signed_in("ada@x.com"))
    assert r.json()["history"]["general"] == TALK


def test_starting_a_mode_over_forgets_that_conversation_only(client):
    _run(_remember("ada@x.com", "resume_coach", TALK))
    _run(_remember("ada@x.com", "career_advisor", TALK))
    r = client.post("/api/advisor/history/clear", headers=_signed_in("ada@x.com"), json={"mode": "resume_coach"})
    assert r.status_code == 200, r.text
    history = client.get("/api/advisor/history", headers=_signed_in("ada@x.com")).json()["history"]
    assert history["resume_coach"] == []
    assert history["career_advisor"] == TALK


def test_an_unknown_mode_isnt_started_over(client):
    r = client.post("/api/advisor/history/clear", headers=_signed_in("ada@x.com"), json={"mode": "everything"})
    assert r.status_code == 400

"""What a candidate sees of their finished interview.

Sign-in sent the stored report column as raw JSON text, which the candidate saw
as-is; my-report sent a parsed report without the scores or the duration.
"""
import asyncio
import json

from conftest import register

from app.services.auth import create_candidate_token

EMAIL = "rep@x.com"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _finished(manager_id, **fields):
    """A completed interview for EMAIL, with a grant so they can sign in."""
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(db, {"name": "Rep", "email": EMAIL}, manager_id=manager_id)
        await db_service.create_candidate_access(db, EMAIL, "Rep", cand.id, manager_id=manager_id)
        iv = await db_service.create_interview(db, {
            "candidate_id": cand.id, "manager_id": manager_id, "candidate_email": EMAIL, "role": "Dev",
        })
        iv.status = "completed"
        for name, value in fields.items():
            setattr(iv, name, value)
        await db.commit()


def _sign_in(client):
    sent = client.post("/api/auth/candidate/send-otp", json={"email": EMAIL})
    assert sent.status_code == 200, sent.text
    r = client.post("/api/auth/candidate/verify-otp", json={"email": EMAIL, "code": sent.json()["debug_code"]})
    assert r.status_code == 200, r.text
    return r.json()["candidate_data"]


def _my_report(client):
    r = client.get("/api/chat/candidate/my-report",
                   headers={"Authorization": f"Bearer {create_candidate_token(EMAIL)}"})
    assert r.status_code == 200, r.text
    return r.json()["interview_report"]


STORED = json.dumps({"report": "## Strong answers", "violations": 1, "eyeContact": 82, "lookAwayCount": 3})
SCORES = [{"question": "Q1", "score": 8}, {"question": "Q2", "score": 6}]


def test_sign_in_sends_the_report_parsed_not_as_json_text(client):
    _, m = register(client, "rep1@co.com")
    _run(_finished(m["id"], report=STORED, scores=SCORES, duration=754,
                   transcript=[{"role": "user", "text": "hi"}]))
    report = _sign_in(client)["interview_report"]
    assert report["report"] == "## Strong answers"
    assert (report["violations"], report["eyeContact"], report["lookAwayCount"]) == (1, 82, 3)
    assert report["scores"] == SCORES
    assert report["avgScore"] == 7.0
    assert report["timer"] == report["duration"] == 754
    assert report["transcript"] == [{"role": "user", "text": "hi"}]


def test_my_report_sends_the_same_shape_as_sign_in(client):
    _, m = register(client, "rep2@co.com")
    _run(_finished(m["id"], report=STORED, scores=SCORES, duration=754))
    assert _my_report(client) == _sign_in(client)["interview_report"]


def test_an_unscored_interview_has_no_average_rather_than_zero(client):
    _, m = register(client, "rep3@co.com")
    _run(_finished(m["id"], report="## The interviewer's notes", scores=[], duration=0))
    report = _my_report(client)
    assert report["report"] == "## The interviewer's notes"
    assert report["avgScore"] is None
    assert report["timer"] == 0


def test_plain_number_scores_average_too(client):
    _, m = register(client, "rep4@co.com")
    _run(_finished(m["id"], report=STORED, scores=[9, 7, 8]))
    assert _my_report(client)["avgScore"] == 8.0


def test_a_stored_average_is_kept(client):
    _, m = register(client, "rep5@co.com")
    _run(_finished(m["id"], report=json.dumps({"report": "ok", "avgScore": 6.5}), scores=SCORES))
    assert _my_report(client)["avgScore"] == 6.5

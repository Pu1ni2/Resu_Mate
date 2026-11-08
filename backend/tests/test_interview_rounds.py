"""A candidate's interviews, kept apart once there's more than one.

The candidate's report, Jarvis's report lookup, the PDF export and the résumé
comparison took the newest interview for the address, so a second round,
still pending, hid the first round's report from all of them. The video room
opened the newest too, and saved what it measured there, not on the
interview being taken.
"""
import asyncio
import io
import json
from datetime import datetime, timedelta

import pypdf
import pytest

from conftest import auth_headers, register

from app.services.auth import create_candidate_token

FIRST_REPORT = "## Round one went well"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _rounds(manager_id, email):
    """A finished first round and a second waiting to be taken: their ids, and the candidate's."""
    from app.core import database
    from app.models.candidate import Candidate, Interview
    now = datetime.utcnow()
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.flush()
        first = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Dev",
                          status="completed", report=json.dumps({"report": FIRST_REPORT}),
                          created_at=now - timedelta(days=2), completed_at=now - timedelta(days=1))
        second = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Dev",
                           status="pending", created_at=now)
        db.add_all([first, second])
        await db.commit()
        return first.id, second.id, cand.id


def _pdf_text(response):
    return "".join(page.extract_text() for page in pypdf.PdfReader(io.BytesIO(response.content)).pages)


def test_the_candidate_still_reads_their_first_report(client):
    _, m = register(client, "r1@co.com")
    _run(_rounds(m["id"], "two1@x.com"))
    r = client.get("/api/chat/candidate/my-report",
                   headers={"Authorization": f"Bearer {create_candidate_token('two1@x.com')}"})
    assert r.status_code == 200, r.text
    assert r.json()["interview_report"]["report"] == FIRST_REPORT


def test_jarvis_still_finds_the_first_report(client):
    # Jarvis reads the candidate's interviews by their id, newest first, and
    # takes the newest finished one.
    tok, m = register(client, "r2@co.com")
    first, _, cid = _run(_rounds(m["id"], "two2@x.com"))
    interviews = client.get(f"/api/chat/candidates/{cid}/interviews", headers=auth_headers(tok)).json()["interviews"]
    finished = next(iv for iv in interviews if iv["status"] == "completed" and iv["report"])
    assert (finished["interview_id"], finished["report"]["report"]) == (first, FIRST_REPORT)


def test_the_list_says_which_interview_each_report_is(client):
    tok, m = register(client, "r3@co.com")
    first, _, _ = _run(_rounds(m["id"], "two3@x.com"))
    results = client.get("/api/chat/get-all-interview-results", headers=auth_headers(tok)).json()["results"]
    assert [r["interview_id"] for r in results] == [first]


def test_the_pdf_is_of_the_interview_asked_for(client):
    tok, m = register(client, "r4@co.com")
    first, second, _ = _run(_rounds(m["id"], "two4@x.com"))
    by_id = client.get(f"/api/chat/interviews/{first}/report.pdf", headers=auth_headers(tok))
    assert by_id.status_code == 200, by_id.text
    assert "Round one went well" in _pdf_text(by_id)
    # The second round, still waiting, has nothing to export yet.
    assert client.get(f"/api/chat/interviews/{second}/report.pdf", headers=auth_headers(tok)).status_code == 409


def test_another_managers_interview_is_not_exported_by_its_id(client):
    _, a = register(client, "r5@co.com")
    tok_b, _ = register(client, "r6@co.com")
    first, _, _ = _run(_rounds(a["id"], "two5@x.com"))
    r = client.get(f"/api/chat/interviews/{first}/report.pdf", headers=auth_headers(tok_b))
    assert r.status_code == 404


def test_the_comparison_is_with_the_interview_asked_for(client, monkeypatch):
    from app.agents.technical_agent import technical_agent
    from app.services.resume_rag import resume_rag
    compared = []

    async def analyze(candidate, report, transcript=None):
        compared.append(report["report"])
        return {"confidence_in_assessment": "high"}
    monkeypatch.setattr(technical_agent, "analyze_credibility", analyze)
    tok, m = register(client, "r7@co.com")
    first, _, cid = _run(_rounds(m["id"], "two7@x.com"))
    resume_rag.candidates.setdefault(m["id"], {})[cid] = {"id": cid, "manager_id": m["id"], "name": "Cand",
                                                           "text": "Cand", "is_resume": True}
    r = client.post("/api/chat/credibility-analysis", headers=auth_headers(tok),
                    json={"candidate_id": cid, "candidate_email": "two7@x.com", "interview_id": first})
    assert r.status_code == 200, r.text
    assert compared == [FIRST_REPORT]


# ── the video room's interview ────────────────────────────────────────────────

async def _interviews(manager_id, email, *fields):
    """Interviews for one candidate, made in this order with these fields: their ids."""
    from app.core import database
    from app.models.candidate import Candidate, Interview
    now = datetime.utcnow()
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.flush()
        rows = [Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Dev",
                          created_at=now - timedelta(hours=len(fields) - i), **f) for i, f in enumerate(fields)]
        db.add_all(rows)
        await db.commit()
        return [row.id for row in rows]


async def _row(iid):
    from app.core import database
    from app.models.candidate import Interview
    from app.services.db_service import report_dict
    async with database.async_session() as db:
        iv = await db.get(Interview, iid)
        return iv.status, report_dict(iv.report), iv.room_name


def _cand(email):
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


def test_the_numbers_go_on_the_interview_the_room_ran(client):
    _, m = register(client, "r8@co.com")
    # The first round being taken, and a second made meanwhile.
    taken, newer = _run(_interviews(m["id"], "two8@x.com", {"status": "in_progress"}, {"status": "pending"}))
    r = client.post("/api/chat/save-interview-result", headers=_cand("two8@x.com"), json={
        "candidate_email": "two8@x.com", "interview_id": taken,
        "report": {"violations": 3, "terminated": True, "timer": 90},
    })
    assert r.status_code == 200, r.text
    status, report, _ = _run(_row(taken))
    assert status == "completed" and report["violations"] == 3
    assert _run(_row(newer))[:2] == ("pending", {})


def test_no_one_elses_interview_can_be_named(client):
    _, m = register(client, "r9@co.com")
    (theirs,) = _run(_interviews(m["id"], "other9@x.com", {"status": "in_progress"}))
    _run(_interviews(m["id"], "two9@x.com", {"status": "in_progress"}))
    r = client.post("/api/chat/save-interview-result", headers=_cand("two9@x.com"), json={
        "candidate_email": "two9@x.com", "interview_id": theirs, "report": {"violations": 3, "terminated": True},
    })
    assert r.json()["status"] == "no interview"
    assert _run(_row(theirs))[:2] == ("in_progress", {})


@pytest.fixture()
def livekit(monkeypatch):
    from app.api import livekit_routes
    from app.core.config import settings
    monkeypatch.setattr(settings, "avatar_interviews", True)
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        monkeypatch.setenv(key, "set")
        monkeypatch.setattr(livekit_routes, key, f"test-{key.lower()}-long-enough-for-hs256")


def test_the_room_opens_the_interview_named(client, livekit):
    _, m = register(client, "r10@co.com")
    first, second = _run(_interviews(m["id"], "two10@x.com", {"status": "pending", "mode": "avatar"},
                                     {"status": "pending", "mode": "avatar"}))
    r = client.post("/api/livekit/create-room", headers=_cand("two10@x.com"),
                    json={"candidate_email": "two10@x.com", "interview_id": first, "consent": True})
    assert r.status_code == 200, r.text
    assert _run(_row(first))[2] == r.json()["room_name"]
    assert _run(_row(second))[2] is None


# ── a candidate's history ─────────────────────────────────────────────────────

def test_every_interview_of_a_candidate_is_listed_newest_first(client):
    # Only the newest was shown anywhere.
    tok, m = register(client, "r11@co.com")
    first, second, cid = _run(_rounds(m["id"], "two11@x.com"))
    history = client.get(f"/api/chat/candidates/{cid}/interviews", headers=auth_headers(tok)).json()["interviews"]
    assert [(h["interview_id"], h["status"]) for h in history] == [(second, "pending"), (first, "completed")]
    assert history[1]["report"]["report"] == FIRST_REPORT
    assert history[0]["report"] is None  # not taken yet


def test_another_managers_interviews_are_not_in_the_history(client):
    _, a = register(client, "r12@co.com")
    tok_b, _ = register(client, "r13@co.com")
    _, _, cid = _run(_rounds(a["id"], "two12@x.com"))
    assert client.get(f"/api/chat/candidates/{cid}/interviews", headers=auth_headers(tok_b)).json()["interviews"] == []

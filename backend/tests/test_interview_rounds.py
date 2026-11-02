"""A candidate's earlier interview stays readable once another is made.

The candidate's report, Jarvis's report lookup, the PDF export and the résumé
comparison took the newest interview for the address, so a second round,
still pending, hid the first round's report from all of them.
"""
import asyncio
import io
import json
from datetime import datetime, timedelta

import pypdf

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
    tok, m = register(client, "r2@co.com")
    _run(_rounds(m["id"], "two2@x.com"))
    results = client.get("/api/chat/get-interview-results/two2@x.com", headers=auth_headers(tok)).json()["results"]
    assert results[0]["report"]["report"] == FIRST_REPORT


def test_the_list_says_which_interview_each_report_is(client):
    tok, m = register(client, "r3@co.com")
    first, _, _ = _run(_rounds(m["id"], "two3@x.com"))
    results = client.get("/api/chat/get-all-interview-results", headers=auth_headers(tok)).json()["results"]
    assert [r["interview_id"] for r in results] == [first]


def test_the_pdf_is_of_the_interview_asked_for_or_the_latest_finished(client):
    tok, m = register(client, "r4@co.com")
    first, _, _ = _run(_rounds(m["id"], "two4@x.com"))
    by_id = client.get(f"/api/chat/export-report/two4@x.com?interview_id={first}", headers=auth_headers(tok))
    assert by_id.status_code == 200, by_id.text
    assert "Round one went well" in _pdf_text(by_id)
    latest = client.get("/api/chat/export-report/two4@x.com", headers=auth_headers(tok))
    assert "Round one went well" in _pdf_text(latest)


def test_another_managers_interview_is_not_exported_by_its_id(client):
    _, a = register(client, "r5@co.com")
    tok_b, _ = register(client, "r6@co.com")
    first, _, _ = _run(_rounds(a["id"], "two5@x.com"))
    r = client.get(f"/api/chat/export-report/two5@x.com?interview_id={first}", headers=auth_headers(tok_b))
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

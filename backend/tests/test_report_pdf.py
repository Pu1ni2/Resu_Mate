"""The PDF report: any text, the right candidate, and no made-up average.

The export crashed on an em dash or a curly quote from the AI's report, an
emoji, or a name in another script; printed 0.0/10 when nothing was scored;
and picked john@x.com's résumé for hn@x.com.
"""
import asyncio
import io
import json

import pypdf

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _seed(manager_id, cid, name, email, text=None):
    from app.services.resume_rag import resume_rag
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {
        "id": cid, "manager_id": manager_id, "name": name, "text": text or f"{name}\n{email}\nEngineer",
        "is_resume": True, "predicted_role": "Engineer", "summary": "Builds things — carefully.",
    }


async def _finished(manager_id, email, report, scores):
    from app.core import database
    from app.services import db_service
    async with database.async_session() as db:
        cand = await db_service.create_candidate_db(db, {"name": "x", "email": email}, manager_id=manager_id)
        iv = await db_service.create_interview(db, {
            "candidate_id": cand.id, "manager_id": manager_id, "candidate_email": email, "role": "Dev",
        })
        iv.status = "completed"
        iv.report = json.dumps(report)
        iv.scores = scores
        await db.commit()


def _export(client, tok, email):
    r = client.get(f"/api/chat/export-report/{email}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    text = "".join(page.extract_text() for page in pypdf.PdfReader(io.BytesIO(r.content)).pages)
    return r, text


def test_any_text_makes_a_pdf(client):
    tok, m = register(client, "pdf1@co.com")
    _seed(m["id"], 1, "李雷 Núñez", "li@x.com")
    _run(_finished(m["id"], "li@x.com",
                   {"report": "## Verdict — “strong” hire ✓ 🚀\n- Clear… mostly", "eyeContact": 81, "violations": 0},
                   [{"score": 8, "feedback": "Good — specific"}]))
    r, text = _export(client, tok, "li@x.com")
    assert "Verdict" in text and "strong" in text
    # A header can't carry 李; the download name is ASCII.
    assert r.headers["content-disposition"] == 'attachment; filename="ResuMate-Report-Nunez.pdf"'


def test_nothing_scored_is_not_zero(client):
    tok, m = register(client, "pdf2@co.com")
    _seed(m["id"], 2, "Ada Lovelace", "ada@x.com")
    _run(_finished(m["id"], "ada@x.com", {"report": "## Notes"}, []))
    _, text = _export(client, tok, "ada@x.com")
    assert "Avg Score:" in text
    assert "0.0/10" not in text


def test_the_average_counts_the_scored_answers(client):
    tok, m = register(client, "pdf3@co.com")
    _seed(m["id"], 3, "Bo Chen", "bo@x.com")
    _run(_finished(m["id"], "bo@x.com", {"report": "ok"},
                   [{"score": 8, "feedback": "a"}, {"score": None, "feedback": "b"}, {"score": 6, "feedback": "c"}]))
    _, text = _export(client, tok, "bo@x.com")
    assert "Avg Score: 7.0/10" in text
    assert "Q1: 8/10" in text and "Q3: 6/10" in text


def test_face_tracking_is_called_what_it_measures(client):
    tok, m = register(client, "pdf4@co.com")
    _seed(m["id"], 4, "Cy Dee", "cy@x.com")
    _run(_finished(m["id"], "cy@x.com", {"report": "ok", "eyeContact": 77, "violations": 1}, []))
    _, text = _export(client, tok, "cy@x.com")
    assert "Face in view: 77%" in text
    assert "Eye Contact" not in text


def test_the_report_is_of_the_candidate_with_that_address(client):
    tok, m = register(client, "pdf5@co.com")
    _seed(m["id"], 5, "John Smith", "john@x.com")          # contains "hn@x.com"
    _seed(m["id"], 6, "Hana Ng", "hn@x.com")
    _run(_finished(m["id"], "hn@x.com", {"report": "ok"}, []))
    _, text = _export(client, tok, "hn@x.com")
    assert "Hana Ng" in text
    assert "John Smith" not in text

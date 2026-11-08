"""An interview's PDF needs its own manager (the export was once public)."""
import asyncio

from conftest import register, auth_headers


def _interview(manager_id, email, status):
    async def make():
        from app.core import database
        from app.models.candidate import Candidate, Interview
        async with database.async_session() as db:
            cand = Candidate(manager_id=manager_id, name="Cand", email=email)
            db.add(cand)
            await db.flush()
            iv = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email,
                           role="Dev", status=status, report='{"report": "## Notes"}')
            db.add(iv)
            await db.commit()
            return iv.id
    return asyncio.get_event_loop().run_until_complete(make())


def test_an_interviews_pdf_requires_auth(client):
    r = client.get("/api/chat/interviews/1/report.pdf")
    assert r.status_code in (401, 403), r.status_code


def test_an_interviews_pdf_is_its_managers_once_it_has_finished(client):
    # By the interview's id: the export's address held the candidate's email.
    tok_a, a = register(client, "expa@co.com")
    tok_b, _ = register(client, "expb@co.com")
    done = _interview(a["id"], "cand@x.com", "completed")
    waiting = _interview(a["id"], "cand@x.com", "pending")
    mine = client.get(f"/api/chat/interviews/{done}/report.pdf", headers=auth_headers(tok_a))
    assert mine.status_code == 200 and mine.headers["content-type"] == "application/pdf"
    assert client.get(f"/api/chat/interviews/{done}/report.pdf", headers=auth_headers(tok_b)).status_code == 404
    assert client.get(f"/api/chat/interviews/{waiting}/report.pdf", headers=auth_headers(tok_a)).status_code == 409
    assert client.get("/api/chat/interviews/999999/report.pdf", headers=auth_headers(tok_a)).status_code == 404

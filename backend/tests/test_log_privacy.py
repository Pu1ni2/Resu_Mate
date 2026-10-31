"""No personal data in the server's log.

It held candidates' addresses, names and accounts, the links in their résumés,
and, in a database error's text, the statement's values: a whole résumé among
them.
"""
import asyncio

import pytest

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_a_database_error_keeps_the_values_out_of_its_text(client):
    from sqlalchemy.exc import IntegrityError
    from app.core import database
    from app.models.candidate import CandidateAccess
    _, manager = register(client, "logs1@co.com")

    async def grant_twice():
        async with database.async_session() as db:
            for _ in range(2):
                db.add(CandidateAccess(email="private.person@x.com", name="Private Person", manager_id=manager["id"]))
                await db.commit()

    with pytest.raises(IntegrityError) as caught:
        _run(grant_twice())
    assert "private.person@x.com" not in str(caught.value)
    assert "Private Person" not in str(caught.value)


def test_an_agent_logs_its_steps_by_name_and_keeps_the_message_for_the_scan(capsys):
    from app.agents.data_agent import data_agent
    entry = data_agent.log("gh_search", "Searching web for Jane Doe's GitHub...")
    assert entry.msg == "Searching web for Jane Doe's GitHub..."
    logged = capsys.readouterr().out
    assert "gh_search" in logged
    assert "Jane Doe" not in logged


def test_creating_an_interview_logs_nothing_of_the_candidate(client, capsys):
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    tok, manager = register(client, "logs2@co.com")

    async def own_candidate():
        async with database.async_session() as db:
            return (await db_service.create_candidate_db(
                db, {"name": "Jane Doe", "email": "jane.doe@x.com", "text": "resume"}, manager_id=manager["id"],
            )).id

    cid = _run(own_candidate())
    resume_rag.candidates.setdefault(manager["id"], {})[cid] = {
        "id": cid, "manager_id": manager["id"], "name": "Jane Doe", "email": "jane.doe@x.com", "text": "resume", "is_resume": True,
    }
    capsys.readouterr()
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": cid, "candidate_email": "jane.doe@x.com", "candidate_name": "Jane Doe", "role": "Dev",
    })
    assert r.status_code == 200, r.text
    logged = capsys.readouterr().out
    assert "jane.doe@x.com" not in logged
    assert "Jane Doe" not in logged


def test_the_links_in_a_resume_are_read_but_not_logged(tmp_path, capsys):
    import fitz
    from app.services.resume_rag import resume_rag
    pdf = tmp_path / "jane_doe_resume.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Jane Doe")
    page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(72, 60, 220, 80), "uri": "https://github.com/janedoe-private"})
    doc.save(str(pdf))
    doc.close()

    links = resume_rag._extract_embedded_links(str(pdf), pdf.name)
    assert "https://github.com/janedoe-private" in links["all_urls"]
    assert "janedoe-private" not in capsys.readouterr().out

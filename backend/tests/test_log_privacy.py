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


def test_no_route_takes_an_email_in_its_address(client):
    # Three did, and the log printed the address, the email with it.
    import main
    taken = sorted({name for route in main.app.routes for name in getattr(route, "param_convertors", {})})
    assert "interview_id" in taken  # the check reads the routes' parameters
    assert [name for name in taken if "email" in name] == []
    for gone in ("/api/chat/export-report/ada@x.com", "/api/chat/get-interview-results/ada@x.com",
                 "/api/chat/interview-status/ada@x.com"):
        assert client.get(gone).status_code == 404, gone


# ── errors in the log: their type and where, never their text ────────────────

def test_the_log_keeps_an_errors_type_and_place_never_its_text():
    from app.core.errors import log_text

    def check_address():
        raise ValueError("ada@x.com isn't a valid address")
    try:
        check_address()
    except ValueError as exc:
        kept = log_text(exc)
    assert kept.startswith("ValueError at tests/test_log_privacy.py:")
    assert "in check_address" in kept
    assert "ada@x.com" not in kept


def test_no_logging_line_puts_an_errors_text_or_traceback_in_the_log():
    # About thirty did: an exception's text, or a traceback, which ends with it.
    import os
    import re
    backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    text_of_error = re.compile(
        r"\{(e|exc|err|error|ex)\}|\{str\((e|exc|err)\)\}|%s\"?,\s*(e|exc|err)\)|"
        r"logger\.exception\(|print_exc\(|exc_info=True")
    files = [os.path.join(backend, "main.py"), os.path.join(backend, "cleanup_stale.py")]
    for folder, _, names in os.walk(os.path.join(backend, "app")):
        files += [os.path.join(folder, n) for n in names if n.endswith(".py")]
    found = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            for number, line in enumerate(f, 1):
                if re.search(r"print\(|logger\.|logging\.", line) and text_of_error.search(line):
                    found.append(f"{os.path.relpath(path, backend)}:{number}")
    assert len(files) > 40  # the walk reached the app's modules
    assert found == []


def test_an_unexpected_errors_line_holds_none_of_its_text(monkeypatch, caplog):
    import logging
    from fastapi.testclient import TestClient
    import main
    from app.services import interview_modes

    def broken():
        raise RuntimeError("Ada Lovelace's résumé broke it")
    monkeypatch.setattr(interview_modes, "avatar_available", broken)
    with caplog.at_level(logging.ERROR, logger="resumate"), TestClient(main.app, raise_server_exceptions=False) as c:
        assert c.get("/api/features").status_code == 500
    line = next(r for r in caplog.records if r.getMessage().startswith("Unhandled error"))
    assert line.getMessage().startswith("Unhandled error: RuntimeError at ")
    assert "Ada Lovelace" not in line.getMessage()
    assert line.exc_info is None


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

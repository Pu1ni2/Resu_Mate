"""A résumé the AI couldn't analyse is marked so, not given a made-up profile.

The manager's upload saved "Professional", "Entry" and 0 years, and the
candidate's own upload "Professional" at "Mid" level, both shown as fact.
"""
import asyncio

import pytest

from app.services.auth import create_candidate_token


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _FailingModel:
    async def ainvoke(self, messages):
        raise RuntimeError("model unavailable")


def test_a_failed_analysis_leaves_the_profile_unknown(monkeypatch):
    from app.services.resume_rag import resume_rag
    monkeypatch.setattr(resume_rag, "llm", _FailingModel())
    data = _run(resume_rag._analyze_resume("Ada Lovelace\nEngineer", "Ada", True))
    assert data["analysis_failed"] is True
    assert (data["predicted_role"], data["experience_level"], data["total_experience_years"]) == (None, None, None)


def test_the_mark_is_saved_and_read_back(client):
    from app.core import database
    from app.services import db_service

    async def save_and_read():
        async with database.async_session() as db:
            row = await db_service.create_candidate_db(db, {"id": 77, "name": "Ada", "analysis_failed": True,
                                                            "predicted_role": None, "total_experience_years": None})
            return row.to_dict()
    saved = _run(save_and_read())
    assert saved["analysis_failed"] is True
    assert saved["predicted_role"] is None


def test_an_analysed_candidate_is_not_marked(client):
    from app.core import database
    from app.services import db_service

    async def save_and_read():
        async with database.async_session() as db:
            row = await db_service.create_candidate_db(db, {"id": 78, "name": "Bo", "predicted_role": "Engineer"})
            return row.to_dict()
    assert _run(save_and_read())["analysis_failed"] is False


def test_the_candidates_own_upload_is_marked_too(client, monkeypatch):
    from app.api import advisor_agent
    monkeypatch.setattr(advisor_agent, "_client", None)
    monkeypatch.setattr(advisor_agent.settings, "openai_api_key", "")
    r = client.post(
        "/api/advisor/upload-resume",
        headers={"Authorization": f"Bearer {create_candidate_token('fa@x.com')}"},
        files={"file": ("ada.txt", b"Ada Lovelace, compiler engineer.", "text/plain")},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["analysis_failed"] is True
    assert (data["predicted_role"], data["experience_level"]) == (None, None)

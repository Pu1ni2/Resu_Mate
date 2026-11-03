"""Years of experience the résumé doesn't give stay unknown.

They were 0: after a restart for a résumé whose analysis failed, and as the
AI's prompts said, "0 years". A null from the analysis failed a comparison,
which threw the whole analysis away.
"""
import asyncio
import json
from types import SimpleNamespace

import pytest

from conftest import auth_headers, register

from app.services.experience import experience_text, known_years
from app.services.resume_rag import resume_rag


def test_years_are_a_number_or_unknown():
    assert known_years(5) == 5.0
    assert known_years("3.5") == 3.5
    assert known_years(0) == 0.0
    for unknown in (None, "", "five", float("nan"), -2, True):
        assert known_years(unknown) is None


def test_years_read_plainly_and_unknown_says_so():
    assert experience_text(5) == "5 years"
    assert experience_text(1) == "1 year"
    assert experience_text(2.5) == "2.5 years"
    assert experience_text(0) == "0 years"
    assert experience_text(None) == "not known"


def test_a_row_without_years_is_listed_without_them(client):
    from app.core import database
    from app.models.candidate import Candidate

    token, user = register(client, "years@x.com")

    async def row():
        async with database.async_session() as db:
            db.add(Candidate(manager_id=user["id"], name="Ada", email="ada@x.com", is_resume=True,
                             analysis_failed=True, total_experience_years=None))
            await db.commit()
    asyncio.get_event_loop().run_until_complete(row())
    [ada] = client.get("/api/candidates", headers=auth_headers(token)).json()["candidates"]
    assert ada["total_experience_years"] is None


def _model_says(monkeypatch, years):
    reply = {"summary": "A designer.", "total_experience_years": years, "predicted_role": "Designer",
             "experience_level": "Mid-Level", "location": None, "skills": ["Figma"], "education": [],
             "work_experience": []}

    class Model:
        async def ainvoke(self, messages):
            return SimpleNamespace(content=json.dumps(reply))
    monkeypatch.setattr(resume_rag, "llm", Model())


@pytest.mark.asyncio
async def test_an_analysis_with_no_years_keeps_the_rest(monkeypatch):
    _model_says(monkeypatch, None)
    data = await resume_rag._analyze_resume("Ada Lovelace. Designer. Figma.", "Ada", True)
    assert not data.get("analysis_failed")
    assert data["total_experience_years"] is None
    assert data["predicted_role"] == "Designer"


@pytest.mark.asyncio
async def test_an_analysis_keeps_years_within_reason(monkeypatch):
    _model_says(monkeypatch, 45)
    assert (await resume_rag._analyze_resume("text", "Ada", True))["total_experience_years"] == 30
    _model_says(monkeypatch, -3)
    assert (await resume_rag._analyze_resume("text", "Ada", True))["total_experience_years"] is None


def test_jarvis_takes_a_candidate_whose_years_are_unknown():
    from app.api.jarvis import CandidateBrief
    brief = CandidateBrief(id=1, name="Ada", total_experience_years=None)
    assert brief.total_experience_years is None

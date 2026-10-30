"""Screening scores only what a run asks for.

A part nobody asked for (skills, experience, education) used to count as a
perfect 100, so a run with only a role gave everyone 85 or more, "Strong Fit",
and the candidate file's evaluation quoted that number. Skills matched only as
exact strings ("React.js" wasn't "React"), an empty predicted role matched every
role, files that weren't résumés were ranked with the rest, and a job
description that couldn't be read was quietly ignored.
"""
import pytest

from app.services import ats_service as ats_module
from app.services.ats_service import ats_service, skill_key, has_skill
from app.tools.openai_tool import openai_tool
from tests.conftest import register, auth_headers

ROLE_ONLY = {"required_skills": [], "nice_to_have_skills": [], "min_experience_years": 0,
             "education_requirement": "", "seniority_level": "", "role_keywords": []}


def person(**extra):
    base = {"id": 1, "name": "Ada", "skills": ["Python"], "total_experience_years": 5,
            "predicted_role": "Backend Engineer", "summary": "", "key_strengths": [],
            "education": [{"degree": "BS Computer Science"}], "is_resume": True}
    base.update(extra)
    return base


async def score(candidate, requirements, role="Backend Engineer"):
    return await ats_service.score_candidate(candidate, requirements, role=role)


@pytest.mark.asyncio
async def test_a_role_only_run_scores_the_role_and_nothing_else():
    unrelated = await score(person(predicted_role="Pastry Chef"), ROLE_ONLY)
    assert unrelated["assessed"] == ["role"]
    assert unrelated["ats_score"] < 35
    assert unrelated["verdict"] == "No Match"
    for part in ("skills_match", "experience_match", "education_match"):
        assert unrelated[part] is None


@pytest.mark.asyncio
async def test_parts_not_asked_for_have_no_share_of_the_score():
    reqs = {**ROLE_ONLY, "required_skills": ["Python"]}
    # Every must-have, and a different role: 45 of the 60 points asked for.
    result = await score(person(predicted_role="Pastry Chef"), reqs)
    assert result["assessed"] == ["skills", "role"]
    assert result["ats_score"] == 75
    assert result["experience_match"] is None


@pytest.mark.asyncio
async def test_nice_to_haves_alone_give_nothing_for_free():
    reqs = {**ROLE_ONLY, "nice_to_have_skills": ["Rust"]}
    result = await score(person(), reqs)
    assert result["skills_match"] == 0


@pytest.mark.asyncio
async def test_an_empty_predicted_role_is_not_a_role_match():
    result = await score(person(predicted_role=""), ROLE_ONLY)
    assert result["role_match"] < 90


def test_skills_match_by_meaning_not_spelling():
    assert skill_key("React.js") == skill_key("ReactJS") == skill_key("react")
    assert skill_key("JS") == "javascript"
    keys = {skill_key(s) for s in ["React.js", "Python 3", "AWS Lambda", "C++"]}
    assert has_skill(keys, "React")
    assert has_skill(keys, "Python")
    assert has_skill(keys, "AWS")
    assert has_skill(keys, "C++")
    # C++ isn't C, and JavaScript isn't Java.
    assert not has_skill(keys, "C")
    assert not has_skill({skill_key("JavaScript")}, "Java")


@pytest.mark.asyncio
async def test_matched_skills_keep_the_requested_spelling():
    reqs = {**ROLE_ONLY, "required_skills": ["React", "Go"]}
    result = await score(person(skills=["react.js", "Golang"]), reqs)
    assert result["matched_skills"] == ["React", "Go"]
    assert result["missing_skills"] == []


def seed(manager_id, *candidates):
    from app.services.resume_rag import resume_rag
    drawer = resume_rag.candidates.setdefault(manager_id, {})
    for c in candidates:
        drawer[c["id"]] = c


def test_a_run_leaves_out_files_it_cannot_screen_and_says_how_many(client):
    token, user = register(client, "screen@x.com")
    seed(user["id"],
         person(id=1, name="Ada"),
         person(id=2, name="Shopping list", is_resume=False),
         person(id=3, name="Bea", analysis_failed=True))
    r = client.post("/api/pipeline/run", headers=auth_headers(token), json={"role": "Backend Engineer"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [c["name"] for c in body["results"]] == ["Ada"]
    assert body["excluded"] == 2
    assert body["assessed"] == ["role"]


def test_a_run_with_nothing_to_screen_says_why(client):
    token, user = register(client, "nothing@x.com")
    seed(user["id"], person(id=1, is_resume=False))
    r = client.post("/api/pipeline/run", headers=auth_headers(token), json={"role": "Backend Engineer"})
    assert r.status_code == 400
    assert "can be screened" in r.json()["detail"]


def test_a_run_needs_a_role(client):
    token, user = register(client, "norole@x.com")
    seed(user["id"], person())
    r = client.post("/api/pipeline/run", headers=auth_headers(token), json={"role": "  "})
    assert r.status_code == 400


def test_an_unreadable_job_description_is_reported_not_ignored(client, monkeypatch):
    async def garbled(prompt, system="", json_mode=False):
        return "not json at all"
    monkeypatch.setattr(openai_tool, "structured_call", garbled)
    token, user = register(client, "jd@x.com")
    seed(user["id"], person())
    r = client.post("/api/pipeline/run", headers=auth_headers(token),
                    json={"role": "Backend Engineer", "jd_text": "We want a backend engineer."})
    assert r.status_code == 502
    assert "job description" in r.json()["detail"]


@pytest.mark.asyncio
async def test_parsing_a_job_description_raises_instead_of_returning_nothing(monkeypatch):
    async def garbled(prompt, system="", json_mode=False):
        return ""
    monkeypatch.setattr(openai_tool, "structured_call", garbled)
    with pytest.raises(ats_module.JDParseError):
        await ats_service.parse_jd("Senior backend role, Python required.", "Backend Engineer")


def test_the_evaluation_quotes_no_screening_score(client, monkeypatch):
    prompts = []

    async def fake_llm(prompt, system="", json_mode=False):
        prompts.append(prompt)
        return "## Evaluation Report: Ada\n### Recommendation: Interview\n" + "Grounded reasoning. " * 6

    monkeypatch.setattr(openai_tool, "structured_call", fake_llm)
    token, user = register(client, "eval@x.com")
    seed(user["id"], person())
    r = client.post("/api/chat/hiring-agent", headers=auth_headers(token),
                    json={"candidate_id": 1, "role": "Backend Engineer"})
    assert r.status_code == 200, r.text
    assert r.json()["ats_score"] is None
    assert not any("/100" in p for p in prompts)

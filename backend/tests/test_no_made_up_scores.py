"""Nothing is scored that wasn't assessed.

When the language model failed, the technical agent made numbers up: 70/100
confidence in a résumé, 50/100 credibility with a "Consider", 5/10 for an
answer. Averages counted a missing score as 0.
"""
import asyncio
import json

import pytest

from app.agents.technical_agent import UNSCORED, technical_agent
from app.services.scores import average_score, describe_average, score_of
from app.tools.openai_tool import openai_tool


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def model(monkeypatch):
    """The language model, answering with `reply` (or raising it), and the prompts it was sent."""
    state = {"reply": "", "prompts": []}

    async def structured_call(prompt, system=""):
        state["prompts"].append(prompt)
        if isinstance(state["reply"], Exception):
            raise state["reply"]
        return state["reply"]
    monkeypatch.setattr(openai_tool, "structured_call", structured_call)
    return state


CANDIDATE = {"name": "Ada", "skills": ["Python"], "predicted_role": "Engineer", "experience_level": "Mid-Level",
             "total_experience_years": 4, "work_experience": [], "education": []}


# ── the averages ──────────────────────────────────────────────────────────────

def test_an_average_counts_only_the_scored_answers():
    assert average_score([{"score": 8}, {"score": None}, 6, "n/a"]) == 7.0
    assert score_of({"score": True}) is None  # a flag, not a score


def test_with_nothing_scored_there_is_no_average():
    assert average_score([]) is None
    assert average_score([{"score": None}]) is None
    assert describe_average([{"score": None}]) == "not scored"
    assert describe_average([{"score": 7}, {"score": 8}]) == "7.5/10"


# ── when the model fails ──────────────────────────────────────────────────────

def test_a_failed_resume_analysis_has_no_confidence_score(model):
    model["reply"] = RuntimeError("model unavailable")
    intel = _run(technical_agent.analyze_resume_gaps(CANDIDATE))
    assert intel["resume_confidence_score"] is None
    assert intel["analysis_failed"] is True


def test_a_failed_credibility_analysis_has_no_score_or_recommendation(model):
    model["reply"] = RuntimeError("model unavailable")
    result = _run(technical_agent.analyze_credibility(CANDIDATE, {"report": "ok", "scores": [8]}))
    assert result["credibility_score"] is None
    assert result["hiring_recommendation"] is None
    assert result["level_assessment"]["match"] is None
    assert result["analysis_failed"] is True


def test_an_answer_the_model_could_not_score_has_no_score(model):
    model["reply"] = RuntimeError("model unavailable")
    assert _run(technical_agent.score_answer("Q?", "A long enough answer.")) == {"score": None, "feedback": UNSCORED}
    model["reply"] = "I'd rather not say."
    assert _run(technical_agent.score_answer("Q?", "A long enough answer."))["score"] is None


def test_a_scored_answer_keeps_its_score(model):
    model["reply"] = "SCORE: 8\nFEEDBACK: Clear and specific."
    assert _run(technical_agent.score_answer("Q?", "A long enough answer.")) == {"score": 8, "feedback": "Clear and specific."}


# ── what the model is told ────────────────────────────────────────────────────

def test_credibility_is_judged_on_the_scored_answers_only(model):
    model["reply"] = json.dumps({"credibility_score": 80})
    _run(technical_agent.analyze_credibility(CANDIDATE, {"report": "ok", "scores": [{"score": 8}, {"score": None}, {"score": 6}]}))
    assert "Average Score: 7.0/10" in model["prompts"][0]
    assert "Per-Question Scores: [8, null, 6]" in model["prompts"][0]


def test_an_interview_with_nothing_scored_is_described_so(model):
    model["reply"] = json.dumps({"credibility_score": 60})
    _run(technical_agent.analyze_credibility(CANDIDATE, {"report": "ok", "scores": []}))
    assert "Average Score: not scored" in model["prompts"][0]


def test_a_report_with_an_unscored_answer_still_writes(model):
    model["reply"] = "## Report"
    _run(technical_agent.generate_report("Ada", "ada@x.com", "Engineer", ["Q1", "Q2"], ["A1", "A2"],
                                         [{"score": 9, "feedback": "good"}, {"score": None, "feedback": UNSCORED}]))
    assert "Average Score: 9.0/10" in model["prompts"][0]

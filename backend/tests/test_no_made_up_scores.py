"""Nothing is scored that wasn't assessed.

When the language model failed, the technical agent made numbers up: 70/100
confidence in a résumé, 50/100 credibility with a "Consider", 5/10 for an
answer. Averages counted a missing score as 0.
"""
import asyncio
import json

import pytest

from app.agents.technical_agent import technical_agent
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
    assert "resume_confidence_score" not in intel
    assert intel["analysis_failed"] is True


def test_a_resume_analysis_gives_no_score_even_if_the_model_adds_one(model):
    model["reply"] = json.dumps({"gaps": [], "red_flags": [], "resume_confidence_score": 42})
    intel = _run(technical_agent.analyze_resume_gaps(CANDIDATE))
    assert "resume_confidence_score" not in intel
    assert "0-100" not in model["prompts"][0]


def test_a_failed_comparison_has_no_score_or_recommendation(model):
    # The résumé-and-interview comparison gives no score or recommendation at
    # all now; a failed one has no findings either.
    model["reply"] = RuntimeError("model unavailable")
    result = _run(technical_agent.analyze_credibility(CANDIDATE, {"report": "ok", "scores": [8]}))
    assert "credibility_score" not in result
    assert "hiring_recommendation" not in result
    assert result["level_assessment"]["match"] is None
    assert result["analysis_failed"] is True


# ── what the model is told ────────────────────────────────────────────────────

def test_the_comparison_reads_what_was_said_not_scores(model):
    model["reply"] = json.dumps({"key_insights": []})
    transcript = [{"role": "interviewer", "text": "Tell me about Python."},
                  {"role": "candidate", "text": "I built a scheduler in it."}]
    _run(technical_agent.analyze_credibility(CANDIDATE, {"report": "ok", "scores": [{"score": 8}]}, transcript=transcript))
    prompt = model["prompts"][0]
    assert "Candidate: I built a scheduler in it." in prompt
    assert "Average Score" not in prompt
    assert "Per-Question Scores" not in prompt


def test_without_a_transcript_the_comparison_says_so_and_reads_the_report(model):
    model["reply"] = json.dumps({"key_insights": []})
    _run(technical_agent.analyze_credibility(CANDIDATE, {"report": "Clear answers about Python.", "scores": []}))
    assert "no transcript was saved" in model["prompts"][0]
    assert "Clear answers about Python." in model["prompts"][0]


def test_a_report_with_an_unscored_answer_still_writes(model):
    model["reply"] = "## Report"
    _run(technical_agent.generate_report("Ada", "ada@x.com", "Engineer", ["Q1", "Q2"], ["A1", "A2"],
                                         [{"score": 9, "feedback": "good"}, {"score": None, "feedback": "This answer couldn't be scored."}]))
    assert "Average Score: 9.0/10" in model["prompts"][0]

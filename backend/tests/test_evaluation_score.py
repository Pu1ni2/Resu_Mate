"""One fit score in the product, not two.

hr_agent's report template ended with "### 📊 Overall Fit Score: [X/100]" while
ats_service independently computed its own 0-100 ats_score on fixed weights. The
same candidate could therefore be 92 on the shortlist and 68 in their evaluation,
on the same scale, with nothing on screen saying one was arithmetic and the other
an opinion.

Screening owns the number. The evaluation gives a decision — Interview / Hold /
Pass — and cites the score rather than inventing one.

Asserting on the prompt template is unusual but right here: the defect was a
line of prompt text, and a future edit could reintroduce it in one keystroke.

Reading the source is not enough on its own, though. These checks passed while
the prompt interpolated a name that was never defined, so every evaluation
raised and the agent quietly fell back to "Evaluation could not be generated."
The last two tests build the real prompt, with the LLM and web search stubbed.
"""
import inspect

import pytest

from app.agents.hr_agent import hr_agent
from app.services.ats_service import ats_service
from app.tools.openai_tool import openai_tool
from app.tools.tavily_tool import tavily_tool


def _prompt_source() -> str:
    return inspect.getsource(hr_agent._generate_evaluation)


def test_prompt_no_longer_asks_for_a_numeric_score():
    src = _prompt_source()
    assert "Overall Fit Score" not in src
    assert "X/100" not in src


def test_prompt_asks_for_a_decision_instead():
    src = _prompt_source()
    assert "Interview / Hold / Pass" in src
    # And explicitly forbids a number, so the model does not helpfully add one.
    assert "Do NOT produce a numeric score" in src


def test_prompt_forbids_reusing_the_screening_verdicts():
    # "Strong Fit" / "Good Fit" are ats_service's verdict labels. Reusing them in
    # the evaluation reads as a second opinion on the same scale.
    src = _prompt_source()
    assert 'Do not use "Strong Fit"' in src


def test_evaluate_accepts_the_screening_score():
    sig = inspect.signature(hr_agent.evaluate)
    assert "ats_score" in sig.parameters


@pytest.mark.asyncio
async def test_ats_service_remains_the_only_scorer():
    """The deterministic scorer still produces a number, and it is reproducible.

    Uses the suite's asyncio marker rather than asyncio.run(): run() closes the
    loop it creates, and conftest's client fixture builds its engine on the
    ambient loop, so a bare asyncio.run() here left every later test that needs
    a database with "no current event loop".
    """
    candidate = {
        "id": 1, "name": "Test", "skills": ["Python", "AWS"],
        "total_experience_years": 5, "predicted_role": "Backend Engineer",
        "education": [{"degree": "BS Computer Science"}], "summary": "",
        "key_strengths": [],
    }
    reqs = {
        "required_skills": ["Python"], "nice_to_have_skills": ["AWS"],
        "min_experience_years": 3, "education_requirement": "",
        "seniority_level": "", "role_keywords": ["backend", "engineer"],
    }
    a = await ats_service.score_candidate(candidate, reqs, role="Backend Engineer")
    b = await ats_service.score_candidate(candidate, reqs, role="Backend Engineer")
    assert isinstance(a["ats_score"], int)
    # Same input, same number — the property that makes it explainable, and the
    # reason it owns the score rather than the model.
    assert a["ats_score"] == b["ats_score"]
    assert a["verdict"] == b["verdict"]


async def _evaluate_with_stubs(monkeypatch, ats_score):
    """Run the real evaluation with the LLM and web search stubbed out.

    Returns the report and the evaluation prompt (None if it was never built).
    The prompt is picked out by its content rather than by call order: when an
    API key is configured, the agent's reflection step calls the same stub.
    """
    prompts = []

    async def fake_llm(prompt, system="", json_mode=False):
        prompts.append(prompt)
        return (
            "## Evaluation Report: Test\n### Recommendation: Interview\n"
            + "Specific reasoning grounded in the resume. " * 4
        )

    async def fake_search(params, context=None):
        return {"answer": ""}

    monkeypatch.setattr(openai_tool, "structured_call", fake_llm)
    monkeypatch.setattr(tavily_tool, "call", fake_search)

    candidate = {
        "id": 1, "name": "Test", "skills": ["Python", "AWS"],
        "total_experience_years": 5, "predicted_role": "Backend Engineer",
        "experience_level": "Mid-Level", "summary": "",
    }
    result = await hr_agent.evaluate(candidate, role="Backend Engineer", ats_score=ats_score)
    built = [p for p in prompts if "Generate this EXACT format" in p]
    return result["report"], (built[0] if built else None)


@pytest.mark.asyncio
async def test_evaluation_builds_and_cites_the_screening_score(monkeypatch):
    report, prompt = await _evaluate_with_stubs(monkeypatch, ats_score=72)
    # The symptom of a prompt that fails to build: the step errors, the agent
    # retries it, then falls back to this text and still reports success.
    assert report != "Evaluation could not be generated."
    assert report.startswith("## Evaluation Report")
    # The report cites the screening figure rather than inventing its own.
    assert "72/100" in prompt


@pytest.mark.asyncio
async def test_evaluation_omits_the_score_when_screening_failed(monkeypatch):
    # /chat/hiring-agent passes None when scoring raised. A missing number is not
    # worth failing the evaluation over, so the report is still produced, just
    # without a score for the model to cite.
    report, prompt = await _evaluate_with_stubs(monkeypatch, ats_score=None)
    assert report.startswith("## Evaluation Report")
    assert "/100" not in prompt

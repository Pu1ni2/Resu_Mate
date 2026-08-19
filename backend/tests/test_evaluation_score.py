"""One fit score in the product, not two.

hr_agent's report template ended with "### 📊 Overall Fit Score: [X/100]" while
ats_service independently computed its own 0-100 ats_score on fixed weights. The
same candidate could therefore be 92 on the shortlist and 68 in their evaluation,
on the same scale, with nothing on screen saying one was arithmetic and the other
an opinion.

Screening owns the number. The evaluation gives a decision — Interview / Hold /
Pass — and cites the score rather than inventing one.

Asserting on the prompt template is unusual but right here: the defect was a
line of prompt text, there is no way to catch its return without calling an LLM,
and a future edit could reintroduce it in one keystroke.
"""
import asyncio
import inspect

from app.agents.hr_agent import hr_agent
from app.services.ats_service import ats_service


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


def test_ats_service_remains_the_only_scorer():
    """The deterministic scorer still produces a number, and it is reproducible."""
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
    a = asyncio.run(ats_service.score_candidate(candidate, reqs, role="Backend Engineer"))
    b = asyncio.run(ats_service.score_candidate(candidate, reqs, role="Backend Engineer"))
    assert isinstance(a["ats_score"], int)
    # Same input, same number — the property that makes it explainable, and the
    # reason it owns the score rather than the model.
    assert a["ats_score"] == b["ats_score"]
    assert a["verdict"] == b["verdict"]

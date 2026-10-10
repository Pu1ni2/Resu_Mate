"""Dates are today's, not the year the code was written.

The résumé analysis counted "Present" as January 2025, so anyone in their
current job was short of experience by every month since; and the salary and
interview-trend searches asked for 2024.
"""
import asyncio
from datetime import date


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_present_means_today_in_the_resume_analysis(monkeypatch):
    from app.services.resume_rag import resume_rag
    prompts = []

    class Model:
        async def ainvoke(self, messages):
            prompts.append(messages[0].content)
            raise RuntimeError("stop here")
    monkeypatch.setattr(resume_rag, "llm", Model())
    _run(resume_rag._analyze_resume("Ada\nEngineer, 2021 - Present", "Ada", True))
    assert f"use {date.today():%B %Y} as end" in prompts[0]
    assert "January 2025" not in prompts[0]


def test_the_salary_search_is_for_this_year():
    from app.agents.hr_agent import hr_agent
    steps = _run(hr_agent.plan("Evaluate", {"candidate": {"location": "Columbus"}, "role": "Data Engineer"}))
    query = steps[0].params["query"]
    assert query.endswith(f"salary requirements {date.today().year}")
    assert "2024" not in query


def test_the_interview_trends_search_is_for_this_year(monkeypatch):
    from app.agents.technical_agent import technical_agent
    from app.tools.openai_tool import openai_tool
    from app.tools.tavily_tool import tavily_tool
    queries = []

    async def call(params, context=None):
        queries.append(params["query"])
        return {"answer": ""}

    async def structured_call(prompt, system=""):
        return "Question one?\nQuestion two?"
    monkeypatch.setattr(tavily_tool, "client", object())
    monkeypatch.setattr(tavily_tool, "call", call)
    monkeypatch.setattr(openai_tool, "structured_call", structured_call)
    _run(technical_agent.generate_smart_questions("Data Engineer", "Mid-Level", 2))
    assert queries == [f"Data Engineer interview questions {date.today().year} trends"]

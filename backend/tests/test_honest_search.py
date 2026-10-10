"""Search results say when there was no search, and summaries use only what was found.

A web search that isn't set up, or failed, came back as an empty list, which
read as "nothing about this person online". The profile scan's summary took
"GitHub" and "LinkedIn" from the agent's memory of earlier runs, which can be
another candidate's, and from its own progress messages.
"""
import asyncio

import pytest

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def tavily(monkeypatch):
    """The search tool, answering with `reply`."""
    from app.tools.tavily_tool import tavily_tool
    state = {"reply": {}}

    async def call(params, context=None):
        return state["reply"]
    monkeypatch.setattr(tavily_tool, "call", call)
    return state


def _search(client, query="Ada Lovelace engineer"):
    tok, _ = register(client, "search@co.com")
    r = client.post("/api/chat/web-search", headers=auth_headers(tok), json={"query": query})
    assert r.status_code == 200, r.text
    return r.json()


# ── web search ────────────────────────────────────────────────────────────────

def test_a_search_that_is_not_set_up_says_so(client, tavily):
    tavily["reply"] = {"error": "Tavily not configured", "results": [], "answer": ""}
    assert _search(client) == {"results": [], "error": "Web search isn't set up on this server."}


def test_a_search_that_timed_out_says_so(client, tavily):
    tavily["reply"] = {"error": "tavily timeout", "results": [], "answer": ""}
    assert _search(client)["error"] == "The web search timed out. Please try again."


def test_a_failed_search_does_not_pass_on_its_insides(client, tavily):
    tavily["reply"] = {"error": "HTTP 500 from upstream at 10.0.0.7", "results": [], "answer": ""}
    body = _search(client)
    assert body["error"] == "The web search failed. Please try again."
    assert "10.0.0.7" not in str(body)


def test_a_search_with_nothing_found_is_just_empty(client, tavily):
    tavily["reply"] = {"results": [], "answer": ""}
    assert _search(client) == {"results": []}


def test_the_chat_is_told_there_was_no_search(tavily):
    from app.agents.research_agent import research_agent
    tavily["reply"] = {"error": "Tavily not configured", "results": [], "answer": ""}
    result = _run(research_agent.search_for_chat("What has Ada published?", "Ada"))
    assert result == {"web_context": "", "sources": [], "unavailable": "Web search isn't set up on this server."}


# ── the profile scan's summary ────────────────────────────────────────────────

@pytest.fixture()
def model(monkeypatch):
    from app.tools.openai_tool import openai_tool
    prompts = []

    async def structured_call(prompt, system=""):
        prompts.append(prompt)
        return "A summary."
    monkeypatch.setattr(openai_tool, "structured_call", structured_call)
    return prompts


def test_the_summary_is_of_what_this_run_found(model):
    from app.agents.data_agent import data_agent
    context = {"name": "Ada", "found_github": {"username": "ada-l", "name": "Ada L", "public_repos": 12, "followers": 3}}
    assert _run(data_agent._summarize(context)) == {"ai_summary": "A summary."}
    assert "@ada-l" in model[0] and "12 public repos" in model[0]
    assert "LinkedIn: Not found" in model[0]


def test_with_nothing_found_there_is_nothing_to_summarise(model):
    from app.agents.base_agent import memory_store
    from app.agents.data_agent import data_agent
    # Another candidate's run, remembered by the agent.
    memory_store.add(data_agent.name, {"action": "find_github", "result_summary": "Grace Hopper: 40 repos"})
    assert _run(data_agent._summarize({"name": "Ada"})) == {"ai_summary": ""}
    assert model == []

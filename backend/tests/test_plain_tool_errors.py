"""The agents' steps and the tools' results say what failed in plain words.

A candidate file's scan showed a failed step's exception text, such as GitHub's
error with the search's address in it, and the tools answered "tavily timeout"
or "Browser error: …".
"""
import httpx
import pytest

from test_retry_policy import _Flaky

SECRET = "raw words from deep inside"
UNREACHABLE = "A service it depends on couldn't be reached. Try again in a moment."


@pytest.mark.asyncio
async def test_a_failed_step_is_told_plainly_and_without_a_try_again():
    result = await _Flaky(RuntimeError(SECRET)).run("task")
    messages = [log.msg for log in result.logs]
    # Tried again by itself, so it doesn't ask the manager to.
    assert "This step failed." in messages
    assert not any(SECRET in message for message in messages)


@pytest.mark.asyncio
async def test_github_failing_is_told_plainly(monkeypatch):
    from app.tools.github_tool import github_tool
    real_client = httpx.AsyncClient

    def unreachable(request):
        raise httpx.ConnectError(SECRET)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(unreachable), **kw))
    found = await github_tool.search_users("jane doe")
    profile = await github_tool.call({"username": "janedoe"})
    assert found["error"] == f"GitHub couldn't be searched. {UNREACHABLE}"
    assert profile["error"] == f"The GitHub profile couldn't be read. {UNREACHABLE}"
    assert SECRET not in repr((found, profile))


@pytest.mark.asyncio
async def test_the_web_search_failing_is_told_plainly(monkeypatch):
    from app.tools.tavily_tool import tavily_tool

    class Broken:
        def search(self, **kwargs):
            raise RuntimeError(SECRET)
    monkeypatch.setattr(tavily_tool, "client", Broken())
    result = await tavily_tool.call({"query": "jane doe"})
    assert result["error"] == "The web search couldn't be done. Try again in a moment."

"""Running out of GitHub quota is a warning, not a failure.

A run that hits the limit tells the manager once and carries on with everyone
it could read. The tool must also tell a rate limit apart from "user not found",
which it used to report for every non-200.
"""
import httpx
import pytest

from conftest import register, auth_headers
import sourcer_fakes as fakes
from app.tools.github_tool import GitHubTool


def _run(client, token):
    r = client.post("/api/sourcer/runs", json={"description": "Backend engineer in Boston, strong Python"},
                    headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return fakes.events(r)


def test_a_rate_limited_search_warns_once_and_the_run_completes(client, monkeypatch):
    from app.services.resume_rag import resume_rag
    fakes.install(monkeypatch, github_rate_limited=True, web_people=2)
    token, user = register(client, "rl@co.com")
    fakes.seed_upload(resume_rag, user["id"], 1, "Maya Chen")

    evs = _run(client, token)
    warnings = [e["message"] for e in evs if e["type"] == "warning"]
    assert len(warnings) == 1 and "rate limit" in warnings[0]
    # The other sources were still read in full.
    judged = [e["pid"] for e in evs if e["type"] == "judged"]
    assert sorted(judged) == ["upload:1", "web:linkedin/web0", "web:linkedin/web1"]
    assert evs[-1]["type"] == "done"


def test_hitting_the_limit_mid_enrichment_keeps_everyone_already_read(client, monkeypatch):
    from app.tools.github_tool import github_tool
    fakes.install(monkeypatch, github_people=6, web_people=0)
    real_profile = github_tool.call

    async def limited_after_three(params):
        if int(params["username"].removeprefix("dev")) >= 3:
            return {"error": "GitHub rate limit reached", "rate_limited": True}
        return await real_profile(params)

    monkeypatch.setattr(github_tool, "call", limited_after_three)
    token, _ = register(client, "rl2@co.com")

    evs = _run(client, token)
    assert sorted(e["pid"] for e in evs if e["type"] == "judged") == ["github:dev0", "github:dev1", "github:dev2"]
    assert sum(e["type"] == "warning" for e in evs) == 1


class _Resp:
    def __init__(self, status, headers=None, text=""):
        self.status_code, self.headers, self.text = status, headers or {}, text


@pytest.mark.parametrize("resp, limited", [
    (_Resp(429), True),
    (_Resp(403, {"X-RateLimit-Remaining": "0"}), True),
    (_Resp(403, text='{"message": "API rate limit exceeded for 1.2.3.4"}'), True),
    (_Resp(403, {"X-RateLimit-Remaining": "4999"}, "Resource not accessible"), False),
    (_Resp(404), False),
    (_Resp(200), False),
])
def test_a_rate_limit_is_told_apart_from_other_failures(resp, limited):
    assert GitHubTool._rate_limited(resp) is limited


@pytest.mark.asyncio
async def test_search_reports_the_limit_instead_of_not_found(monkeypatch):
    # The suite's asyncio marker, not asyncio.run(): run() closes its loop and
    # leaves later database tests with no current event loop.
    def handler(request):
        return httpx.Response(403, headers={"X-RateLimit-Remaining": "0"}, json={"message": "API rate limit exceeded"})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    tool = GitHubTool()

    search = await tool.search_users("language:python")
    assert search["rate_limited"] is True and search["items"] == []
    profile = await tool.call({"username": "octocat"})
    assert profile == {"error": "GitHub rate limit reached", "rate_limited": True}

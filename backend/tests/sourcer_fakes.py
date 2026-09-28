"""Stand-ins for the sourcer's outside calls: the LLM, GitHub and web search.

install() puts them in place with monkeypatch so no request leaves the machine,
and returns a dict counting the calls made. The fake judge answers from a
`levels` function, so each test decides who is strong on what.
"""
import json
import re


PLAN = {
    "req": {"title": "Backend Engineer", "location": "Boston", "summary": "Python backend engineer"},
    "criteria": [
        {"label": "Python", "kind": "must"},
        {"label": "Shipped a product", "kind": "nice"},
    ],
    "filter": {"title_terms": ["backend engineer"], "keyword_terms": ["python"], "location_terms": ["boston"]},
    "github_queries": ["language:python location:boston"],
    "web_queries": ["site:linkedin.com/in backend engineer boston"],
}


def default_levels(pid):
    # Strong on the must-have everywhere; the nice-to-have only for GitHub people.
    return {"c1": "strong", "c2": "strong" if pid.startswith("github:") else "none"}


def install(monkeypatch, *, github_people=3, web_people=2, github_rate_limited=False,
            levels=default_levels, usage=(100, 20)):
    from app.tools.github_tool import github_tool
    from app.tools.openai_tool import openai_tool
    from app.tools.tavily_tool import tavily_tool

    calls = {"plan": 0, "judge": 0, "github_profile": 0, "web": 0}

    async def llm(prompt, system="", model=None):
        tokens = {"input_tokens": usage[0], "output_tokens": usage[1]}
        if "search plan" in system:
            calls["plan"] += 1
            return json.dumps(PLAN), tokens
        calls["judge"] += 1
        pids = re.findall(r"^\[([^\]]+)\]", prompt, re.M)
        return json.dumps({"people": [
            {
                "pid": pid,
                "criteria": [{"id": cid, "value": f"{cid} evidence", "level": lvl} for cid, lvl in levels(pid).items()],
                "judgement": f"Judged {pid}.",
            }
            for pid in pids
        ]}), tokens

    async def search_users(q, per_page=100, page=1):
        if github_rate_limited:
            return {"error": "GitHub rate limit reached", "rate_limited": True, "total_count": 0, "items": []}
        items = [{"login": f"dev{i}", "avatar_url": f"https://a/{i}", "html_url": f"https://github.com/dev{i}"}
                 for i in range(github_people)] if page == 1 else []
        return {"total_count": 4200, "items": items}

    async def profile(params):
        calls["github_profile"] += 1
        login = params["username"]
        return {
            "name": login.title(), "bio": "Founding engineer", "location": "Boston",
            "languages": {"Python": 3}, "top_repos": [], "public_repos": 3, "followers": 1,
            "created_at": "2020-01-01", "profile_url": f"https://github.com/{login}", "avatar_url": "",
        }

    async def web(params):
        calls["web"] += 1
        return {"answer": "", "results": [
            {"title": f"Web Person{i} - Backend Engineer | LinkedIn", "url": f"https://www.linkedin.com/in/web{i}",
             "content": "Python services. Location: Boston"}
            for i in range(web_people)
        ]}

    monkeypatch.setattr(openai_tool, "llm", object())
    monkeypatch.setattr(openai_tool, "structured_call_with_usage", llm)
    monkeypatch.setattr(github_tool, "search_users", search_users)
    monkeypatch.setattr(github_tool, "call", profile)
    monkeypatch.setattr(tavily_tool, "call", web)
    return calls


def seed_upload(resume_rag, manager_id, candidate_id, name, **fields):
    """Put a parsed resume straight into a manager's in-memory drawer."""
    resume_rag.candidates.setdefault(manager_id, {})[candidate_id] = {
        "id": candidate_id, "manager_id": manager_id, "name": name, "is_resume": True,
        "email": f"{name.split()[0].lower()}@example.com", "predicted_role": "Backend Engineer",
        "location": "Boston", "skills": ["Python"], "summary": "", "text": "python services",
        **fields,
    }


def events(response) -> list:
    """The NDJSON events of a streamed run."""
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]

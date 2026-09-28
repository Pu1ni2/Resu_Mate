"""GitHub API Tool — Fetch user profiles, repos, activity"""
from typing import Dict, Any
from app.core.config import settings


class GitHubTool:
    def __init__(self):
        self.token = settings.github_token

    def _headers(self) -> Dict:
        headers = {"Accept": "application/vnd.github.v3+json"}
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        return headers

    @staticmethod
    def _rate_limited(resp) -> bool:
        """GitHub signals an exhausted quota with 403 (primary) or 429 (secondary).

        A 403 is also "forbidden" for other reasons, so it only counts as a rate
        limit when the remaining-quota header says zero or the body says so.
        """
        if resp.status_code == 429:
            return True
        if resp.status_code != 403:
            return False
        if resp.headers.get("X-RateLimit-Remaining") == "0":
            return True
        return "rate limit" in (resp.text or "").lower()

    async def search_users(self, q: str, per_page: int = 100, page: int = 1) -> Dict:
        """Search GitHub users, e.g. 'language:python location:boston'.

        Returns what the search endpoint gives (login, avatar, profile URL) plus
        total_count, so a caller can say how many matched even when it reads
        fewer. Enrich each login with call() for repos and languages.
        """
        import httpx
        if not q:
            return {"error": "No query provided", "total_count": 0, "items": []}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://api.github.com/search/users",
                    params={"q": q, "per_page": min(per_page, 100), "page": page},
                    headers=self._headers(),
                )
            if self._rate_limited(resp):
                return {"error": "GitHub rate limit reached", "rate_limited": True, "total_count": 0, "items": []}
            if resp.status_code != 200:
                return {"error": f"GitHub search failed ({resp.status_code})", "total_count": 0, "items": []}
            data = resp.json()
            # Search also returns organisations; only people can be hired.
            items = [
                {"login": u.get("login", ""), "avatar_url": u.get("avatar_url", ""), "html_url": u.get("html_url", "")}
                for u in data.get("items", [])
                if u.get("type") == "User"
            ]
            return {"total_count": data.get("total_count", 0), "items": items}
        except Exception as e:
            return {"error": f"GitHub API error: {str(e)}", "total_count": 0, "items": []}

    async def call(self, params: Dict, context: Dict = None) -> Dict:
        """Fetch GitHub profile data"""
        import httpx
        username = params.get("username", "")
        if not username:
            return {"error": "No username provided"}

        headers = self._headers()

        try:
            # Default httpx timeout is 5s connect / no read cap; bound it so a
            # slow GitHub response doesn't tie up a worker.
            async with httpx.AsyncClient(timeout=15.0) as client:
                user_resp = await client.get(f"https://api.github.com/users/{username}", headers=headers)
                if self._rate_limited(user_resp):
                    return {"error": "GitHub rate limit reached", "rate_limited": True}
                if user_resp.status_code != 200:
                    return {"error": f"GitHub user '{username}' not found"}
                user = user_resp.json()

                repos_resp = await client.get(f"https://api.github.com/users/{username}/repos?sort=updated&per_page=10", headers=headers)
                repos = repos_resp.json() if repos_resp.status_code == 200 else []

                events_resp = await client.get(f"https://api.github.com/users/{username}/events?per_page=30", headers=headers)
                events = events_resp.json() if events_resp.status_code == 200 else []

            languages = {}
            top_repos = []
            for repo in repos[:10]:
                if repo.get("fork"):
                    continue
                lang = repo.get("language")
                if lang:
                    languages[lang] = languages.get(lang, 0) + 1
                top_repos.append({
                    "name": repo.get("name", ""), "description": repo.get("description", "") or "",
                    "language": lang or "N/A", "stars": repo.get("stargazers_count", 0),
                    "forks": repo.get("forks_count", 0), "url": repo.get("html_url", ""),
                    "updated": repo.get("updated_at", "")[:10]
                })

            return {
                "username": username, "name": user.get("name", username),
                "bio": user.get("bio", ""), "avatar_url": user.get("avatar_url", ""),
                "profile_url": user.get("html_url", ""), "public_repos": user.get("public_repos", 0),
                "followers": user.get("followers", 0), "following": user.get("following", 0),
                "location": user.get("location", ""), "company": user.get("company", ""),
                "blog": user.get("blog", ""), "created_at": user.get("created_at", "")[:10],
                "languages": dict(sorted(languages.items(), key=lambda x: x[1], reverse=True)),
                "top_repos": top_repos[:6],
                "recent_pushes": sum(1 for e in events if e.get("type") == "PushEvent"),
                "recent_prs": sum(1 for e in events if e.get("type") == "PullRequestEvent"),
            }
        except Exception as e:
            return {"error": f"GitHub API error: {str(e)}"}


github_tool = GitHubTool()

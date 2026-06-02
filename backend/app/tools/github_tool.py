"""GitHub API Tool — Fetch user profiles, repos, activity"""
from typing import Dict, Any
from app.core.config import settings


class GitHubTool:
    def __init__(self):
        self.token = settings.github_token

    async def call(self, params: Dict, context: Dict = None) -> Dict:
        """Fetch GitHub profile data"""
        import httpx
        username = params.get("username", "")
        if not username:
            return {"error": "No username provided"}

        headers = {"Accept": "application/vnd.github.v3+json"}
        if self.token:
            headers["Authorization"] = f"token {self.token}"

        try:
            # Default httpx timeout is 5s connect / no read cap; bound it so a
            # slow GitHub response doesn't tie up a worker.
            async with httpx.AsyncClient(timeout=15.0) as client:
                user_resp = await client.get(f"https://api.github.com/users/{username}", headers=headers)
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

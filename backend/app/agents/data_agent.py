"""
Data Agent — Extracts, scans, and enriches candidate profiles.

This agent:
1. Extracts text + links from resume PDF
2. Finds GitHub/LinkedIn via embedded links, regex, or web search
3. Scrapes GitHub profile (Playwright) + LinkedIn (Tavily)
4. Combines all data into enriched candidate profile
5. Reflects: is the data complete? any conflicts?
"""
import re
import json
from typing import Dict, List, Any
from app.agents.base_agent import BaseAgent, AgentStep
from app.tools.pdf_tool import pdf_tool
from app.tools.github_tool import github_tool
from app.tools.tavily_tool import tavily_tool
from app.tools.browser_tool import browser_tool
from app.tools.openai_tool import openai_tool


class DataAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="DataAgent",
            persona="I am a data extraction specialist. I find every piece of information about a candidate from their resume, GitHub, LinkedIn, and the web. I am thorough and accurate.",
            tools={
                "pdf": self._use_pdf,
                "github_api": self._use_github_api,
                "github_browser": self._use_github_browser,
                "tavily": self._use_tavily,
                "browser": self._use_browser,
                "llm": self._use_llm,
            }
        )

    async def plan(self, task: str, context: Dict) -> List[AgentStep]:
        """Custom planning for data extraction — no LLM needed, we know the steps"""
        steps = []
        
        file_path = context.get("file_path")
        candidate_text = context.get("text", "")
        embedded_links = context.get("embedded_links", {})
        
        # Step 1: Extract text from PDF (if file provided)
        if file_path:
            steps.append(AgentStep(
                action="extract_pdf", tool="pdf",
                params={"file_path": file_path, "file_name": context.get("file_name", "")},
                reason="Extract text and embedded links from resume PDF"
            ))

        # Step 2: Find GitHub (from embedded links → regex → web search)
        gh_url = embedded_links.get("github_url", "")
        if gh_url or candidate_text:
            steps.append(AgentStep(
                action="find_github", tool="github_api",
                params={"embedded_url": gh_url, "text": candidate_text, "name": context.get("name", "")},
                reason="Find and fetch GitHub profile data"
            ))

        # Step 3: Find LinkedIn (from embedded links → web search via Tavily)
        li_url = embedded_links.get("linkedin_url", "")
        if li_url or candidate_text:
            steps.append(AgentStep(
                action="find_linkedin", tool="tavily",
                params={"embedded_url": li_url, "text": candidate_text, "name": context.get("name", "")},
                reason="Find LinkedIn profile data via web search"
            ))

        # Step 4: AI Summary of all findings
        steps.append(AgentStep(
            action="summarize", tool="llm",
            params={"task": "Summarize all collected data about this candidate"},
            reason="Generate AI summary combining all sources"
        ))

        return steps

    async def execute_step(self, step: AgentStep, context: Dict) -> Any:
        """Custom execution for each data extraction step"""
        
        if step.action == "extract_pdf":
            return await self._use_pdf(step.params, context)
        elif step.action == "find_github":
            return await self._find_github(step.params, context)
        elif step.action == "find_linkedin":
            return await self._find_linkedin(step.params, context)
        elif step.action == "summarize":
            return await self._summarize(context)
        else:
            return await super().execute_step(step, context)

    async def reflect(self, task: str, results: List, context: Dict) -> Dict:
        """Check if we gathered enough data"""
        has_github = any(r and isinstance(r, dict) and r.get("github") for r in results if r)
        has_linkedin = any(r and isinstance(r, dict) and r.get("linkedin") for r in results if r)
        has_text = bool(context.get("text", ""))

        if not has_text and not has_github and not has_linkedin:
            return {"needs_retry": False, "feedback": "Limited data found. Resume text may be too short or corrupted."}

        feedback_parts = []
        if has_github:
            feedback_parts.append("GitHub profile found")
        if has_linkedin:
            feedback_parts.append("LinkedIn data found")
        if has_text:
            feedback_parts.append("Resume text extracted")

        return {"needs_retry": False, "feedback": ". ".join(feedback_parts)}

    async def synthesize(self, task: str, results: List, reflection: Dict, context: Dict) -> Dict:
        """Combine all results into an enriched profile"""
        profile = {
            "github": None,
            "linkedin": None,
            "portfolio": None,
            "contact": {"email": None, "phone": None},
            "ai_summary": "",
            "logs": self.get_logs_dict()
        }

        for result in results:
            if not result or not isinstance(result, dict):
                continue
            if "github" in result and result["github"]:
                profile["github"] = result["github"]
            if "linkedin" in result and result["linkedin"]:
                profile["linkedin"] = result["linkedin"]
            if "portfolio" in result:
                profile["portfolio"] = result["portfolio"]
            if "contact" in result:
                for k, v in result["contact"].items():
                    if v and not profile["contact"].get(k):
                        profile["contact"][k] = v
            if "ai_summary" in result:
                profile["ai_summary"] = result["ai_summary"]
            if "text" in result and result["text"]:
                context["text"] = result["text"]
            if "links" in result:
                context["embedded_links"] = result["links"]

        profile["logs"] = self.get_logs_dict()
        return profile

    # ═══════ TOOL IMPLEMENTATIONS ═══════

    async def _use_pdf(self, params: Dict, context: Dict) -> Dict:
        result = await pdf_tool.call(params)
        text = result.get("text", "")
        links = result.get("links", {})
        
        # Also extract contact from text
        contact = pdf_tool.extract_contact_from_text(text)
        
        # Update context for subsequent steps
        context["text"] = text
        context["embedded_links"] = links
        context["contact_from_text"] = contact
        
        self.log("pdf_done", f"Extracted {len(text)} chars, {len(links.get('all_urls', []))} embedded links", "success")
        return {"text": text, "links": links, "contact": contact}

    async def _find_github(self, params: Dict, context: Dict) -> Dict:
        """Multi-strategy GitHub discovery — strict matching only"""
        username = None
        
        # Strategy 1: Embedded URL (most reliable)
        embedded_url = params.get("embedded_url") or context.get("embedded_links", {}).get("github_url", "")
        if embedded_url:
            m = re.search(r'github\.com/([a-zA-Z0-9_-]+)', embedded_url)
            if m:
                username = m.group(1)
                self.log("gh_embedded", f"Found GitHub from embedded link: {username}", "success")

        # Strategy 2: Regex on resume text
        if not username:
            contact = context.get("contact_from_text", {})
            username = contact.get("github_username")
            if username:
                self.log("gh_regex", f"Found GitHub from text: {username}", "success")

        # Strategy 3: Web search — BUT only accept if URL clearly matches
        if not username:
            name = params.get("name") or context.get("name", "")
            if name:
                self.log("gh_search", f"Searching web for {name}'s GitHub...")
                search_result = await tavily_tool.call({"query": f'"{name}" github.com profile', "max_results": 3})
                for r in search_result.get("results", []):
                    url = r.get("url", "")
                    title = r.get("title", "").lower()
                    # Only accept if the URL is actually a github.com user page AND title mentions the name
                    if 'github.com/' in url and name.split()[0].lower() in title:
                        m = re.search(r'github\.com/([a-zA-Z0-9_-]+)', url)
                        if m:
                            found = m.group(1)
                            # Skip generic pages
                            if found.lower() not in ['topics', 'trending', 'explore', 'search', 'features', 'pricing', 'about']:
                                username = found
                                self.log("gh_found", f"Found GitHub via web search: {username}", "success")
                                break

        if not username:
            self.log("gh_none", "No GitHub profile found", "warning")
            return {"github": None}

        # Verify by actually fetching the profile
        self.log("gh_fetch", f"Fetching GitHub data for @{username}...")
        gh_data = await github_tool.call({"username": username})
        
        if gh_data.get("error"):
            self.log("gh_error", f"GitHub API: {gh_data['error']}", "error")
            return {"github": None}

        # Extra verification: check if the GitHub user's name matches candidate name
        candidate_name = (params.get("name") or context.get("name", "")).lower()
        gh_name = (gh_data.get("name") or "").lower()
        if candidate_name and gh_name and candidate_name.split()[0] not in gh_name and gh_name.split()[0] not in candidate_name:
            self.log("gh_mismatch", f"GitHub name '{gh_data.get('name')}' doesn't match candidate '{context.get('name')}'. Skipping.", "warning")
            return {"github": None}

        self.log("gh_done", f"GitHub: {gh_data.get('name', username)} | {gh_data.get('public_repos', 0)} repos | {gh_data.get('followers', 0)} followers", "success")
        return {"github": gh_data}

    async def _find_linkedin(self, params: Dict, context: Dict) -> Dict:
        """Find LinkedIn data via Tavily (Playwright gets blocked)"""
        li_username = None

        # Strategy 1: Embedded URL
        embedded_url = params.get("embedded_url") or context.get("embedded_links", {}).get("linkedin_url", "")
        if embedded_url:
            m = re.search(r'linkedin\.com/in/([a-zA-Z0-9_-]+)', embedded_url)
            if m:
                li_username = m.group(1)
                self.log("li_embedded", f"Found LinkedIn from embedded link: {li_username}", "success")

        # Strategy 2: Regex
        if not li_username:
            contact = context.get("contact_from_text", {})
            li_username = contact.get("linkedin_username")
            if li_username:
                self.log("li_regex", f"Found LinkedIn from text: {li_username}", "success")

        if not li_username:
            self.log("li_none", "No LinkedIn profile found", "warning")
            return {"linkedin": None}

        # Fetch via Tavily (LinkedIn blocks Playwright)
        self.log("li_fetch", f"Searching LinkedIn data for {li_username}...")
        name = params.get("name") or context.get("name", "")
        search = await tavily_tool.call({"query": f"site:linkedin.com/in/{li_username} OR {name} linkedin profile", "max_results": 3})

        li_profile = {
            "username": li_username,
            "url": f"https://www.linkedin.com/in/{li_username}",
            "name": name, "headline": "", "location": "", "about": ""
        }

        if search.get("answer"):
            li_profile["about"] = search["answer"][:500]

        for r in search.get("results", []):
            if "linkedin" in r.get("url", "").lower():
                parts = r.get("title", "").split(" - ")
                if len(parts) >= 2:
                    li_profile["name"] = parts[0].strip()
                    li_profile["headline"] = " - ".join(parts[1:]).replace(" | LinkedIn", "").strip()
                if not li_profile["about"] and r.get("content"):
                    li_profile["about"] = r["content"][:500]

        if li_profile.get("headline"):
            self.log("li_done", f"LinkedIn: {li_profile['name']} | {li_profile['headline'][:60]}", "success")
        else:
            self.log("li_partial", f"LinkedIn: limited data for {li_username}", "warning")

        return {"linkedin": li_profile}

    async def _summarize(self, context: Dict) -> Dict:
        """Generate AI summary of all findings"""
        from app.agents.base_agent import memory_store
        name = context.get("name", "Candidate")

        # Collect from persistent memory
        gh_info = ""
        li_info = ""
        for mem in memory_store.get(self.name)[-10:]:
            result = mem.get("result_summary", "") or ""
            action = mem.get("action", "") or ""
            if "github" in action.lower() and result:
                gh_info = result
            if "linkedin" in action.lower() and result:
                li_info = result

        # Also check step results directly from current run logs
        for log_entry in self.logs:
            if "github" in log_entry.msg.lower() and "✓" in log_entry.msg:
                gh_info = gh_info or log_entry.msg
            if "linkedin" in log_entry.msg.lower() and ("✓" in log_entry.msg or log_entry.status == "success"):
                li_info = li_info or log_entry.msg

        prompt = f"""Summarize what we found about {name}:
GitHub: {gh_info or 'Not found'}
LinkedIn: {li_info or 'Not found'}
Resume role: {context.get('predicted_role', 'N/A')}
Provide 3-5 sentences for a hiring manager."""

        summary = await openai_tool.structured_call(prompt, "You are a recruiter summarizing candidate profiles. Be concise.")
        return {"ai_summary": summary}

    async def _use_github_api(self, params, context):
        return await self._find_github(params, context)

    async def _use_tavily(self, params, context):
        return await self._find_linkedin(params, context)

    async def _use_github_browser(self, params, context):
        username = params.get("username", "")
        if not username:
            return {}
        return await browser_tool.scrape_github(username)

    async def _use_browser(self, params, context):
        return await browser_tool.call(params, context)

    async def _use_llm(self, params, context):
        return await self._summarize(context)


# Singleton
data_agent = DataAgent()
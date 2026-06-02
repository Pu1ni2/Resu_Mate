"""
Research Agent — Web search, candidate research, chat enrichment.

Handles:
1. Auto web search in AI chat (decides if search needed)
2. Standalone web search
3. Candidate research and fact-checking
"""
import json
from typing import Dict, List, Any
from app.agents.base_agent import BaseAgent, AgentStep
from app.tools.openai_tool import openai_tool
from app.tools.tavily_tool import tavily_tool


class ResearchAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="ResearchAgent",
            persona="I am a research analyst. I find accurate, up-to-date information from the web. I cross-reference sources and cite them properly.",
            tools={
                "tavily": self._web_search,
                "llm": self._llm_call,
            }
        )

    async def should_search(self, message: str, candidate_name: str = "") -> bool:
        """Decide if a user message needs web search"""
        keywords = [
            'linkedin', 'github', 'portfolio', 'website', 'online', 'social media',
            'search', 'find', 'look up', 'google', 'web', 'internet', 'profile',
            'current', 'latest', 'recent', 'now', 'today', 'news',
            'salary', 'market rate', 'industry', 'average', 'trends',
            'tell me about', 'who is', 'what do you know', 'more about',
            'search about', 'find out', 'research', 'company'
        ]

        msg_lower = message.lower()
        if any(kw in msg_lower for kw in keywords):
            return True

        # Ask LLM to decide
        if self.llm:
            try:
                prompt = f"Should a web search help answer this about a job candidate? Reply ONLY 'YES' or 'NO'.\nQuestion: {message}\nCandidate: {candidate_name}"
                resp = await openai_tool.structured_call(prompt, "You decide if web search would help. Reply ONLY YES or NO.")
                return 'YES' in resp.upper()
            except Exception as exc:
                self.log("should_search_error", f"LLM gating failed; defaulting to no-search: {exc}")
        return False

    async def search_for_chat(self, query: str, candidate_name: str = "") -> Dict:
        """Search web and format results for chat context"""
        search_query = f"{candidate_name} {query}" if candidate_name else query
        if len(search_query) > 100:
            search_query = f"{candidate_name} {' '.join(query.split()[:8])}"

        self.log("search", f"Searching: {search_query[:60]}...")
        result = await tavily_tool.call({"query": search_query, "max_results": 5})

        web_context = ""
        sources = []

        if result.get("answer"):
            web_context += f"\nWEB SEARCH SUMMARY:\n{result['answer']}\n"

        for i, item in enumerate(result.get("results", [])[:5], 1):
            web_context += f"\n[{i}] {item.get('title', '')}\n{item.get('content', '')[:200]}\nSource: {item.get('url', '')}\n"
            sources.append({"title": item.get("title", ""), "url": item.get("url", "")})

        self.log("search_done", f"Found {len(sources)} results", "success")
        return {"web_context": web_context, "sources": sources}

    async def standalone_search(self, query: str, candidate_id: int = None, candidate_name: str = None) -> Dict:
        """Standalone web search endpoint"""
        result = await tavily_tool.call({"query": query, "max_results": 5, "search_depth": "basic"})

        results = []
        if result.get("answer"):
            results.append({"title": "AI Summary", "snippet": result["answer"], "url": ""})

        for item in result.get("results", []):
            results.append({
                "title": item.get("title", "No title"),
                "snippet": item.get("content", "")[:300],
                "url": item.get("url", "")
            })

        return {"results": results}

    async def _web_search(self, params, context):
        return await tavily_tool.call(params, context)

    async def _llm_call(self, params, context):
        return await openai_tool.call(params, context)


research_agent = ResearchAgent()

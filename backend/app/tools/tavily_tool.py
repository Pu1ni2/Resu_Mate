"""Tavily Web Search Tool"""
import asyncio
from typing import Dict, Any, List
from app.core.config import settings

_TAVILY_TIMEOUT_S = 20.0


class TavilyTool:
    def __init__(self):
        self.api_key = settings.tavily_api_key
        self.client = None
        if self.api_key:
            try:
                from tavily import TavilyClient
                self.client = TavilyClient(api_key=self.api_key)
            except ImportError:
                print("[WARNING] tavily-python not installed")

    async def call(self, params: Dict, context: Dict = None) -> Dict:
        """Search the web"""
        if not self.client:
            return {"error": "Tavily not configured", "results": [], "answer": ""}

        query = params.get("query", "")
        max_results = params.get("max_results", 5)
        search_depth = params.get("search_depth", "basic")

        try:
            # TavilyClient.search is synchronous; run in a thread so it can be
            # cancelled by the asyncio.wait_for timeout instead of blocking the loop.
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.search,
                    query=query,
                    search_depth=search_depth,
                    max_results=max_results,
                    include_answer=True,
                ),
                timeout=_TAVILY_TIMEOUT_S,
            )
            return {
                "answer": response.get("answer", ""),
                "results": [
                    {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", "")[:300]}
                    for r in response.get("results", [])
                ]
            }
        except asyncio.TimeoutError:
            return {"error": "tavily timeout", "results": [], "answer": ""}
        except Exception as e:
            return {"error": str(e), "results": [], "answer": ""}

    async def search_person(self, name: str, platform: str = "") -> Dict:
        """Search for a person on a specific platform"""
        query = f"{name} {platform}" if platform else name
        return await self.call({"query": query, "max_results": 3})


tavily_tool = TavilyTool()

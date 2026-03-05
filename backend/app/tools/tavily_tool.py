"""Tavily Web Search Tool"""
from typing import Dict, Any, List
from app.core.config import settings


class TavilyTool:
    def __init__(self):
        self.api_key = settings.tavily_api_key
        self.client = None
        if self.api_key:
            try:
                from tavily import TavilyClient
                self.client = TavilyClient(api_key=self.api_key)
            except ImportError:
                print("⚠️ tavily-python not installed")

    async def call(self, params: Dict, context: Dict = None) -> Dict:
        """Search the web"""
        if not self.client:
            return {"error": "Tavily not configured", "results": [], "answer": ""}
        
        query = params.get("query", "")
        max_results = params.get("max_results", 5)
        search_depth = params.get("search_depth", "basic")
        
        try:
            response = self.client.search(
                query=query,
                search_depth=search_depth,
                max_results=max_results,
                include_answer=True
            )
            return {
                "answer": response.get("answer", ""),
                "results": [
                    {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", "")[:300]}
                    for r in response.get("results", [])
                ]
            }
        except Exception as e:
            return {"error": str(e), "results": [], "answer": ""}

    async def search_person(self, name: str, platform: str = "") -> Dict:
        """Search for a person on a specific platform"""
        query = f"{name} {platform}" if platform else name
        return await self.call({"query": query, "max_results": 3})


tavily_tool = TavilyTool()

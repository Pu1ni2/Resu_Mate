"""OpenAI Tool — LLM calls, embeddings, TTS, STT"""
from typing import Dict, Any
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from app.core.config import settings


class OpenAITool:
    def __init__(self):
        self.llm = None
        self.embeddings = None
        if settings.openai_api_key:
            self.llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, temperature=0.3)
            self.embeddings = OpenAIEmbeddings(api_key=settings.openai_api_key, model="text-embedding-3-small")

    async def call(self, params: Dict, context: Dict = None) -> str:
        """Make an LLM call"""
        if not self.llm:
            return "LLM not available — check OPENAI_API_KEY"
        prompt = params.get("prompt", "")
        system = params.get("system", "You are a helpful AI assistant.")
        response = await self.llm.ainvoke([SystemMessage(content=system), HumanMessage(content=prompt)])
        return response.content

    async def structured_call(self, prompt: str, system: str = "", json_mode: bool = False) -> str:
        """Make an LLM call with system prompt"""
        if not self.llm:
            return ""
        msgs = []
        if system:
            msgs.append(SystemMessage(content=system))
        msgs.append(HumanMessage(content=prompt))
        response = await self.llm.ainvoke(msgs)
        return response.content


openai_tool = OpenAITool()

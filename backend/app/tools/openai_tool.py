"""OpenAI Tool — LLM calls, embeddings, TTS, STT"""
from typing import Dict, Any, Optional, Tuple
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from app.core.config import settings


_REQUEST_TIMEOUT_S = 45.0  # cover GPT-4o p99 latency without blocking forever


class OpenAITool:
    def __init__(self):
        self.llm = None
        self.embeddings = None
        # Clients for models other than OPENAI_MODEL, built on first use.
        self._models: Dict[str, ChatOpenAI] = {}
        if settings.openai_api_key:
            self.llm = ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key,
                temperature=0.3,
                timeout=_REQUEST_TIMEOUT_S,
                max_retries=1,
            )
            self.embeddings = OpenAIEmbeddings(
                api_key=settings.openai_api_key,
                model="text-embedding-3-small",
                timeout=_REQUEST_TIMEOUT_S,
                max_retries=1,
            )

    async def call(self, params: Dict, context: Dict = None) -> str:
        """Make an LLM call"""
        if not self.llm:
            return "LLM not available — check OPENAI_API_KEY"
        prompt = params.get("prompt", "")
        system = params.get("system", "You are a helpful AI assistant.")
        response = await self.llm.ainvoke([SystemMessage(content=system), HumanMessage(content=prompt)])
        return response.content

    def _llm_for(self, model: Optional[str]):
        """The client for `model`, or the default one when model is blank or the default.

        Returns None when no API key is configured, like self.llm.
        """
        if not self.llm or not model or model == settings.openai_model:
            return self.llm
        client = self._models.get(model)
        if client is None:
            client = ChatOpenAI(
                model=model,
                api_key=settings.openai_api_key,
                temperature=0.3,
                timeout=_REQUEST_TIMEOUT_S,
                max_retries=1,
            )
            self._models[model] = client
        return client

    @staticmethod
    def _messages(prompt: str, system: str = "") -> list:
        msgs = []
        if system:
            msgs.append(SystemMessage(content=system))
        msgs.append(HumanMessage(content=prompt))
        return msgs

    async def structured_call(self, prompt: str, system: str = "", json_mode: bool = False) -> str:
        """Make an LLM call with system prompt"""
        if not self.llm:
            return ""
        response = await self.llm.ainvoke(self._messages(prompt, system))
        return response.content

    async def structured_call_with_usage(self, prompt: str, system: str = "",
                                         model: Optional[str] = None) -> Tuple[str, Dict[str, int]]:
        """Like structured_call, but also returns the tokens the call used.

        usage is {"input_tokens", "output_tokens"}. Both are zero when no LLM is
        configured or the provider did not report them, so callers can always
        add them up. `model` overrides OPENAI_MODEL for this call.
        """
        usage = {"input_tokens": 0, "output_tokens": 0}
        llm = self._llm_for(model)
        if not llm:
            return "", usage
        response = await llm.ainvoke(self._messages(prompt, system))
        meta = getattr(response, "usage_metadata", None) or {}
        usage["input_tokens"] = int(meta.get("input_tokens") or 0)
        usage["output_tokens"] = int(meta.get("output_tokens") or 0)
        return response.content, usage


openai_tool = OpenAITool()

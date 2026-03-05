"""
Base Agent Framework v3 — Production-grade agent with:
- Plan → Execute → Reflect → Output pipeline
- Step-level retry with exponential backoff
- Persistent memory (saves to file, DB-ready)
- Structured logging with timestamps
- Performance metrics and monitoring
- Fallback strategies per step
"""
import json
import time
import asyncio
import traceback
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.core.config import settings

logger = logging.getLogger("resumate.agents")


class AgentStatus(Enum):
    IDLE = "idle"
    PLANNING = "planning"
    EXECUTING = "executing"
    REFLECTING = "reflecting"
    COMPLETE = "complete"
    ERROR = "error"
    RETRYING = "retrying"


@dataclass
class AgentStep:
    action: str
    tool: str
    params: Dict
    reason: str
    result: Any = None
    status: str = "pending"
    duration: float = 0
    retries: int = 0
    error: str = ""


@dataclass
class AgentLog:
    step: str
    msg: str
    status: str = ""
    timestamp: float = field(default_factory=time.time)
    duration: float = 0


@dataclass
class AgentMetrics:
    total_duration: float = 0
    steps_total: int = 0
    steps_succeeded: int = 0
    steps_failed: int = 0
    steps_retried: int = 0
    llm_calls: int = 0
    tool_calls: int = 0
    retries: int = 0

    def to_dict(self):
        return {
            "total_duration_s": round(self.total_duration, 2),
            "steps": {"total": self.steps_total, "ok": self.steps_succeeded, "failed": self.steps_failed, "retried": self.steps_retried},
            "llm_calls": self.llm_calls, "tool_calls": self.tool_calls, "retries": self.retries
        }


@dataclass
class AgentResult:
    output: Any
    logs: List[AgentLog]
    steps: List[AgentStep]
    metrics: AgentMetrics
    success: bool
    error: Optional[str] = None
    agent_name: str = ""
    task: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


# ═══════ PERSISTENT MEMORY ═══════

class AgentMemoryStore:
    """Persistent agent memory — JSON file backed, DB-ready interface"""
    FILE = "agent_memory.json"

    def __init__(self):
        self._store = self._load()

    def _load(self) -> Dict:
        try:
            with open(self.FILE, 'r') as f:
                return json.load(f)
        except:
            return {}

    def _save(self):
        try:
            with open(self.FILE, 'w') as f:
                json.dump(self._store, f, indent=2, default=str)
        except:
            pass

    def get(self, agent: str) -> List[Dict]:
        return self._store.get(agent, [])

    def add(self, agent: str, entry: Dict):
        if agent not in self._store:
            self._store[agent] = []
        self._store[agent].append({**entry, "ts": datetime.utcnow().isoformat()})
        self._store[agent] = self._store[agent][-50:]
        self._save()

    def get_relevant(self, agent: str, task: str, limit: int = 5) -> List[Dict]:
        words = set(task.lower().split())
        scored = []
        for mem in self.get(agent):
            score = sum(1 for w in words if w in json.dumps(mem, default=str).lower())
            if score > 0:
                scored.append((score, mem))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [m for _, m in scored[:limit]]

    def clear(self, agent: str = None):
        if agent:
            self._store.pop(agent, None)
        else:
            self._store = {}
        self._save()


memory_store = AgentMemoryStore()


# ═══════ BASE AGENT ═══════

class BaseAgent:
    def __init__(self, name: str, persona: str, tools: Dict[str, Callable] = None):
        self.name = name
        self.persona = persona
        self.tools = tools or {}
        self.logs: List[AgentLog] = []
        self.steps: List[AgentStep] = []
        self.status = AgentStatus.IDLE
        self.metrics = AgentMetrics()

        self.max_retries = 2
        self.max_step_retries = 3
        self.max_steps = 10
        self.step_timeout = 30
        self.retry_backoff = 1.5

        if settings.openai_api_key:
            self.llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, temperature=0.3)
        else:
            self.llm = None

    def log(self, step: str, msg: str, status: str = "", duration: float = 0):
        entry = AgentLog(step=step, msg=msg, status=status, duration=duration)
        self.logs.append(entry)
        emoji = {"success": "✅", "error": "❌", "warning": "⚠️"}.get(status, "🔄")
        print(f"  [{self.name}] {emoji} {msg}")
        return entry

    async def run(self, task: str, context: Dict = None, retry_count: int = 0) -> AgentResult:
        start = time.time()
        self.logs = []
        self.steps = []
        self.metrics = AgentMetrics()
        self.status = AgentStatus.PLANNING
        context = context or {}

        self.log("start", f"Agent '{self.name}' activated | {task[:80]}...")

        # Load memories
        mems = memory_store.get_relevant(self.name, task)
        if mems:
            context["_memories"] = mems
            self.log("memory", f"Loaded {len(mems)} relevant memories")

        try:
            # 1. PLAN
            self.log("plan", "Creating plan...")
            plan = await self.plan(task, context)
            self.steps = plan
            self.metrics.steps_total = len(plan)
            self.log("plan_done", f"Plan: {len(plan)} steps", "success")

            # 2. EXECUTE (with per-step retry)
            self.status = AgentStatus.EXECUTING
            results = []
            for i, step in enumerate(plan[:self.max_steps]):
                result = await self._execute_with_retry(step, i, context)
                results.append(result)

            # 3. REFLECT
            self.status = AgentStatus.REFLECTING
            self.log("reflect", "Reflecting...")
            reflection = await self.reflect(task, results, context)

            if reflection.get("needs_retry") and retry_count < self.max_retries:
                self.metrics.retries += 1
                self.log("retry", f"Retry {retry_count+1}/{self.max_retries}", "warning")
                return await self.run(task, context, retry_count + 1)

            if reflection.get("feedback"):
                self.log("reflect_done", reflection["feedback"], "success")

            # 4. SYNTHESIZE
            self.log("synthesize", "Generating output...")
            output = await self.synthesize(task, results, reflection, context)

            self.status = AgentStatus.COMPLETE
            self.metrics.total_duration = time.time() - start
            self.log("complete", f"Done in {self.metrics.total_duration:.1f}s | {self.metrics.steps_succeeded}/{self.metrics.steps_total} steps", "success")

            memory_store.add(self.name, {"task": task[:200], "success": True, "duration": round(self.metrics.total_duration, 2)})

            return AgentResult(output=output, logs=self.logs, steps=self.steps, metrics=self.metrics, success=True, agent_name=self.name, task=task[:200])

        except Exception as e:
            self.status = AgentStatus.ERROR
            self.metrics.total_duration = time.time() - start
            err = str(e)
            self.log("error", f"Failed: {err[:150]}", "error")
            traceback.print_exc()
            memory_store.add(self.name, {"task": task[:200], "success": False, "error": err[:200]})
            return AgentResult(output=None, logs=self.logs, steps=self.steps, metrics=self.metrics, success=False, error=err, agent_name=self.name, task=task[:200])

    async def _execute_with_retry(self, step: AgentStep, idx: int, context: Dict) -> Any:
        """Execute step with retry + exponential backoff"""
        last_err = None
        step_start = time.time()

        for attempt in range(self.max_step_retries):
            try:
                if attempt > 0:
                    wait = self.retry_backoff ** attempt
                    self.log(f"step_{idx}_retry", f"Retry {attempt} for {step.action} (wait {wait:.1f}s)", "warning")
                    await asyncio.sleep(wait)
                    step.retries = attempt
                    self.metrics.steps_retried += 1
                else:
                    self.log(f"step_{idx}", f"Executing: {step.reason}")

                step.status = "running"
                result = await asyncio.wait_for(self.execute_step(step, context), timeout=self.step_timeout)

                step.result = result
                step.status = "done"
                step.duration = time.time() - step_start
                self.metrics.steps_succeeded += 1
                self.metrics.tool_calls += 1
                self.log(f"step_{idx}_done", f"✓ {step.action} ({step.duration:.1f}s)", "success", step.duration)
                return result

            except asyncio.TimeoutError:
                last_err = f"Timeout ({self.step_timeout}s)"
                self.log(f"step_{idx}_timeout", f"Timeout: {step.action}", "warning")
            except Exception as e:
                last_err = str(e)[:150]
                self.log(f"step_{idx}_err", f"Error: {last_err}", "error")

        step.status = "failed"
        step.error = last_err or "Unknown"
        step.duration = time.time() - step_start
        self.metrics.steps_failed += 1
        self.log(f"step_{idx}_failed", f"'{step.action}' failed after {self.max_step_retries} attempts", "error")
        return None

    # ═══════ OVERRIDE IN SUBCLASSES ═══════

    async def plan(self, task: str, context: Dict) -> List[AgentStep]:
        if not self.llm:
            return [AgentStep(action="llm_call", tool="openai", params={"prompt": task}, reason="Direct call")]

        tools = list(self.tools.keys())
        mems = json.dumps(context.get("_memories", [])[-3:], default=str)[:300]
        prompt = f"You are {self.name}.\nTASK: {task}\nTOOLS: {', '.join(tools)}\nMEMORY: {mems}\nPlan 3-7 steps. JSON array only:\n[{{\"action\":\"\",\"tool\":\"\",\"params\":{{}},\"reason\":\"\"}}]"

        resp = await self.llm.ainvoke([SystemMessage(content="Planning AI. JSON only."), HumanMessage(content=prompt)])
        self.metrics.llm_calls += 1
        try:
            data = json.loads(resp.content.strip().replace('```json','').replace('```',''))
            return [AgentStep(action=d.get("action",""), tool=d.get("tool","openai"), params=d.get("params",{}), reason=d.get("reason","")) for d in data]
        except:
            return [AgentStep(action="direct", tool="openai", params={"task": task}, reason="Fallback")]

    async def execute_step(self, step: AgentStep, context: Dict) -> Any:
        if step.tool in self.tools:
            return await self.tools[step.tool](step.params, context)
        elif step.tool in ("openai", "llm"):
            return await self._llm_call(step.params, context)
        raise ValueError(f"Unknown tool: {step.tool}")

    async def reflect(self, task: str, results: List, context: Dict) -> Dict:
        if not self.llm:
            return {"needs_retry": False, "feedback": "OK"}
        ok = sum(1 for r in results if r is not None)
        fail = len(results) - ok
        if fail > len(results) / 2:
            return {"needs_retry": True, "feedback": f"{fail}/{len(results)} failed"}
        try:
            resp = await self.llm.ainvoke([SystemMessage(content="JSON only."), HumanMessage(content=f"Task:{task[:80]}\n{ok} ok, {fail} fail. Complete? {{\"needs_retry\":false,\"feedback\":\"...\"}}")])
            self.metrics.llm_calls += 1
            return json.loads(resp.content.strip().replace('```json','').replace('```',''))
        except:
            return {"needs_retry": False, "feedback": "OK"}

    async def synthesize(self, task: str, results: List, reflection: Dict, context: Dict) -> Any:
        if not self.llm:
            return {"results": results}
        prompt = f"Task: {task}\nResults: {json.dumps([str(r)[:200] for r in results if r], default=str)}\nSynthesize."
        resp = await self.llm.ainvoke([SystemMessage(content=f"You are {self.name}. {self.persona}"), HumanMessage(content=prompt)])
        self.metrics.llm_calls += 1
        return resp.content

    async def _llm_call(self, params: Dict, context: Dict) -> str:
        if not self.llm:
            return "LLM not available"
        prompt = params.get("prompt") or params.get("task", "")
        system = params.get("system", f"You are {self.name}. {self.persona}")
        resp = await self.llm.ainvoke([SystemMessage(content=system), HumanMessage(content=prompt)])
        self.metrics.llm_calls += 1
        return resp.content

    def get_logs_dict(self) -> List[Dict]:
        return [{"step": l.step, "msg": l.msg, "status": l.status, "duration": l.duration} for l in self.logs]

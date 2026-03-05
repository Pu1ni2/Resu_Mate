"""
Agent Orchestrator — Routes tasks to the correct agent.
For complex tasks, chains multiple agents together.
Tracks metrics and provides monitoring data.
"""
from typing import Dict, Any, List
from datetime import datetime
from app.agents.base_agent import AgentResult


class Orchestrator:
    """Central coordinator that routes tasks to the right agent"""

    def __init__(self):
        self._agents = {}
        self._history: List[Dict] = []  # Run history for monitoring
        self._total_runs = 0
        self._total_success = 0
        self._total_failures = 0

    def register(self, name: str, agent):
        self._agents[name] = agent
        print(f"  🤖 Agent registered: {name}")

    async def route(self, task_type: str, task: str, context: Dict = None) -> AgentResult:
        """Route a task to the appropriate agent"""
        context = context or {}
        agent_name = self._get_agent_for_task(task_type)

        if agent_name not in self._agents:
            from app.agents.base_agent import AgentResult, AgentMetrics
            return AgentResult(output={"error": f"No agent for '{task_type}'"}, logs=[], steps=[],
                             metrics=AgentMetrics(), success=False, error=f"Agent not found: {agent_name}")

        agent = self._agents[agent_name]
        print(f"\n🎯 Orchestrator: '{task_type}' → {agent_name}")

        result = await agent.run(task, context)

        # Track metrics
        self._total_runs += 1
        if result.success:
            self._total_success += 1
        else:
            self._total_failures += 1

        self._history.append({
            "agent": agent_name, "task_type": task_type,
            "success": result.success, "duration": result.metrics.total_duration,
            "timestamp": datetime.utcnow().isoformat()
        })
        self._history = self._history[-100:]  # Keep last 100

        return result

    async def chain(self, tasks: list, context: Dict = None) -> list:
        """Chain multiple agents — output feeds into next"""
        context = context or {}
        results = []
        for task_type, task_desc in tasks:
            result = await self.route(task_type, task_desc, context)
            results.append(result)
            if result.success and isinstance(result.output, dict):
                context.update(result.output)
        return results

    def get_monitoring_data(self) -> Dict:
        """Get monitoring/health data"""
        agent_stats = {}
        for name, agent in self._agents.items():
            from app.agents.base_agent import memory_store
            mems = memory_store.get(name)
            recent = mems[-5:] if mems else []
            agent_stats[name] = {
                "status": agent.status.value,
                "total_memories": len(mems),
                "recent_runs": len([m for m in recent if m.get("success")]),
                "recent_failures": len([m for m in recent if not m.get("success")]),
            }

        return {
            "total_runs": self._total_runs,
            "success_rate": round(self._total_success / max(self._total_runs, 1) * 100, 1),
            "agents": agent_stats,
            "recent_history": self._history[-10:]
        }

    def _get_agent_for_task(self, task_type: str) -> str:
        routing = {
            "scan": "data", "extract": "data", "enrich": "data", "scan_resume": "data",
            "evaluate": "hr", "email": "hr", "compare": "hr", "hiring_agent": "hr", "draft_email": "hr",
            "interview": "technical", "score": "technical", "questions": "technical", "interview_report": "technical",
            "search": "research", "web_search": "research", "research": "research", "chat": "research",
        }
        return routing.get(task_type, "data")


orchestrator = Orchestrator()

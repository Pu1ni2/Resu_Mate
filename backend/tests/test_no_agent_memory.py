"""The agents keep no memory from one run to the next.

Each run's task, often naming a candidate, and its outcome, error text
included, went into one file, agent_memory.json, shared by every company;
the default planning prompt then sent the last three to the model. Nothing
used it.
"""
import asyncio
from types import SimpleNamespace

from app.agents.base_agent import BaseAgent


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _Planner(BaseAgent):
    """Plans with the base planner, and does nothing else."""

    def __init__(self):
        super().__init__(name="Planner", persona="test", tools={})

    async def execute_step(self, step, context):
        return "done"

    async def reflect(self, task, results, context):
        return {"needs_retry": False, "feedback": "ok"}

    async def synthesize(self, task, results, reflection, context):
        return "done"


class _Model:
    def __init__(self):
        self.prompts = []

    async def ainvoke(self, messages):
        self.prompts.append(" ".join(m.content for m in messages))
        return SimpleNamespace(content='[{"action": "look", "tool": "openai", "params": {}, "reason": "r"}]')


def test_a_run_writes_no_file_and_the_next_plan_holds_no_earlier_run(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    agent = _Planner()
    agent.llm = _Model()
    _run(agent.run("Research Ada Lovelace's GitHub"))
    _run(agent.run("Research Grace Hopper's GitHub"))
    assert not (tmp_path / "agent_memory.json").exists()
    assert "Grace Hopper" in agent.llm.prompts[-1]
    assert "Ada Lovelace" not in agent.llm.prompts[-1]


def test_monitoring_lists_no_memory(client):
    r = client.get("/monitoring", headers={"X-Agent-Token": "test-agent-secret"})
    assert r.status_code == 200
    assert set(r.json()) == {"orchestrator", "integrations"}

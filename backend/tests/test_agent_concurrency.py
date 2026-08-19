"""Concurrent runs of the same agent must not corrupt each other.

The agents are module-level singletons (data_agent, hr_agent, ...) and run()
used to reset self.logs / self.steps / self.metrics on the instance. run() awaits
in four places, so two overlapping requests interleaved: the second wiped the
first's in-flight logs, their metrics counters incremented against each other,
and AgentResult handed back references to the shared lists — meaning a caller
could serialise whatever the other request had left behind.

These tests drive a stub agent directly. The property is about state ownership,
so it holds without any LLM or network involved (conftest also clears
OPENAI_API_KEY, so self.llm is None here).
"""
import asyncio

import pytest

from app.agents.base_agent import AgentStep, BaseAgent


class _Stub(BaseAgent):
    """Plans N steps whose only job is to log their own name and yield."""

    def __init__(self, name, steps=6):
        super().__init__(name=name, persona="test", tools={})
        self.n = steps

    async def plan(self, task, context):
        m = context["marker"]
        return [
            AgentStep(action=f"{m}{i}", tool="stub", params={}, reason=f"{m}{i}")
            for i in range(self.n)
        ]

    async def execute_step(self, step, context):
        # Yield control so the event loop interleaves the two runs. This is the
        # await that made the original bug the normal case rather than a rare race.
        await asyncio.sleep(0)
        self.log(step.action, context["marker"])
        self.metrics.llm_calls += 1
        return context["marker"]

    async def reflect(self, task, results, context):
        await asyncio.sleep(0)
        return {"needs_retry": False, "feedback": "ok"}

    async def synthesize(self, task, results, reflection, context):
        await asyncio.sleep(0)
        return context["marker"]


@pytest.mark.asyncio
async def test_two_concurrent_runs_of_one_instance_keep_separate_logs():
    # One shared instance, exactly like the module-level singletons.
    agent = _Stub("shared")

    # The marker rides in the per-run context, not on the instance — putting it
    # on the instance would let the second run overwrite it before the first
    # logged anything, and the test would pass for the wrong reason.
    r1, r2 = await asyncio.gather(
        agent.run("task-A", {"marker": "A"}),
        agent.run("task-B", {"marker": "B"}),
    )

    for r in (r1, r2):
        assert r.success, r.error
        # Each result's logs must belong to one run only. Before the fix the
        # lists were shared, so both results saw the same mixed log.
        markers = {l.msg for l in r.logs if l.msg in {"A", "B"}}
        assert len(markers) <= 1, f"logs mixed across runs: {markers}"


@pytest.mark.asyncio
async def test_metrics_are_not_shared_between_concurrent_runs():
    agent = _Stub("shared-metrics", steps=5)

    r1, r2 = await asyncio.gather(
        agent.run("t1", {"marker": "A"}),
        agent.run("t2", {"marker": "B"}),
    )

    # Each run planned 5 steps, so each must count its own 5 — not 10 between
    # them, and not 5 on one with 0 on the other.
    assert r1.metrics.steps_succeeded == 5, r1.metrics.to_dict()
    assert r2.metrics.steps_succeeded == 5, r2.metrics.to_dict()
    assert r1.metrics is not r2.metrics


@pytest.mark.asyncio
async def test_result_is_a_snapshot_not_a_live_reference():
    agent = _Stub("snapshot", steps=2)
    result = await agent.run("first", {"marker": "A"})
    before = len(result.logs)

    # A later run must not retroactively change an earlier result.
    await agent.run("second", {"marker": "B"})
    assert len(result.logs) == before


@pytest.mark.asyncio
async def test_attribute_access_outside_a_run_does_not_raise():
    # Helpers and tests touch these attributes without going through run().
    agent = _Stub("bare")
    assert agent.logs == []
    assert agent.steps == []
    assert agent.metrics.llm_calls == 0
    agent.log("x", "y")
    assert len(agent.logs) == 1

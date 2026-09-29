"""A step that hits a bug fails at once; a step that hits bad luck is retried.

The retry loop used to treat both alike: three tries with backoff sleeps. A bug
fails identically every time, so it only added seconds and hid the traceback.
"""
import pytest

from app.agents.base_agent import AgentStep, BaseAgent


class _Flaky(BaseAgent):
    """One step that raises `error` on every call, counting the calls."""

    def __init__(self, error):
        super().__init__(name="flaky", persona="test", tools={})
        self.error = error
        self.calls = 0
        self.retry_backoff = 0  # no real sleeping in tests

    async def plan(self, task, context):
        return [AgentStep(action="work", tool="stub", params={}, reason="work")]

    async def execute_step(self, step, context):
        self.calls += 1
        raise self.error

    async def reflect(self, task, results, context):
        return {"needs_retry": False}

    async def synthesize(self, task, results, reflection, context):
        return "done"


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [
    NameError("name 'score_line' is not defined"),
    AttributeError("'NoneType' object has no attribute 'get'"),
    TypeError("unsupported operand"),
    KeyError("missing"),
])
async def test_a_coding_error_is_not_retried(error):
    agent = _Flaky(error)
    result = await agent.run("task")
    assert agent.calls == 1
    assert any("not retried" in log.msg for log in result.logs)
    assert any("failed after 1 attempt" in log.msg for log in result.logs)


@pytest.mark.asyncio
async def test_a_transient_error_is_retried_three_times():
    agent = _Flaky(RuntimeError("upstream timed out"))
    result = await agent.run("task")
    assert agent.calls == 3
    assert any("failed after 3 attempts" in log.msg for log in result.logs)

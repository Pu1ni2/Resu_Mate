"""Code nothing used, gone, so it can't come back unnoticed.

The browser tool's two handlers were never reached: the Data agent plans its
own steps, and Playwright wasn't even installed. /chat/interview-report had no
caller, and wrote a report the interviews no longer use. start.sh started the
server the way nothing else did.
"""
import importlib
import os

import pytest

from conftest import auth_headers, register

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_the_browser_tool_is_gone():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("app.tools.browser_tool")
    from app.agents.data_agent import data_agent
    assert set(data_agent.tools) == {"pdf", "github_api", "tavily", "llm"}


def test_the_old_interview_report_route_is_gone(client):
    tok, _ = register(client, "gone@co.com")
    r = client.post("/api/chat/interview-report", headers=auth_headers(tok), json={})
    assert r.status_code == 404
    from app.agents.technical_agent import technical_agent
    from app.services import db_service, scores
    assert not hasattr(technical_agent, "generate_report")
    assert not hasattr(db_service, "save_interview_result")
    assert not hasattr(scores, "describe_average")


def test_start_sh_is_gone():
    assert not os.path.exists(os.path.join(BACKEND, "start.sh"))

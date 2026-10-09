"""What /health and /monitoring tell, and to whom.

/health said "healthy" without checking anything, and listed which API keys
were set; /monitoring showed every company's agent activity with no login.
"""
from conftest import auth_headers, register

AGENT = {"X-Agent-Token": "test-agent-secret"}


def test_health_is_ok_when_the_database_answers(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_health_is_503_when_the_database_does_not(client, monkeypatch):
    from app.core import database

    class Unreachable:
        def connect(self):
            raise ConnectionRefusedError("database unreachable")

    monkeypatch.setattr(database, "engine", Unreachable())
    r = client.get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "unavailable", "database": "unreachable"}


def test_health_does_not_say_which_keys_are_set(client):
    body = client.get("/health").text
    for word in ("llm", "search", "github", "agents"):
        assert word not in body


def test_monitoring_needs_the_operator_secret(client):
    tok, _ = register(client, "mon@co.com")
    assert client.get("/monitoring").status_code == 401
    assert client.get("/monitoring", headers=auth_headers(tok)).status_code == 401
    assert client.get("/monitoring", headers={"X-Agent-Token": "a-guess"}).status_code == 401
    r = client.get("/monitoring", headers=AGENT)
    assert r.status_code == 200
    assert set(r.json()["integrations"]) == {"llm", "search", "github"}

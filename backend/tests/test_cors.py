"""The API answers its own site, and only what that site sends.

Production let in four localhost origins and allowed credentials, which
nothing uses, and every method and header. Its frontend address defaulted to
one deployment's, so any other deployment sent its candidates there.
"""
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings


def _settings(**env):
    # Explicit values, so the developer's .env doesn't change the answer.
    return Settings(secret_key="x" * 40, **env)


def test_production_allows_the_frontend_and_what_is_listed_only():
    s = _settings(debug=False, frontend_url="https://app.example.com/",
                  cors_origins="https://other.example.com/, ,https://app.example.com")
    assert s.cors_origins_list == ["https://app.example.com", "https://other.example.com"]


def test_a_blank_cors_setting_cannot_lock_the_frontend_out():
    s = _settings(debug=False, frontend_url="https://app.example.com", cors_origins="")
    assert s.cors_origins_list == ["https://app.example.com"]


def test_local_runs_also_allow_the_dev_servers():
    s = _settings(debug=True, frontend_url="", cors_origins="")
    assert {"http://localhost:3006", "http://localhost:5173"} <= set(s.cors_origins_list)


def test_production_does_not_start_without_the_frontends_address(monkeypatch):
    import main
    from app.core.config import settings
    from app.services.email_service import email_service

    async def database_ready():
        pass
    monkeypatch.setattr(main, "init_db", database_ready)
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "frontend_url", "")
    with pytest.raises(RuntimeError, match="FRONTEND_URL"):
        with TestClient(main.app):
            pass


def _preflight(client, origin, method="GET", headers=""):
    asked = {"Origin": origin, "Access-Control-Request-Method": method}
    if headers:
        asked["Access-Control-Request-Headers"] = headers
    return client.options("/api/candidates", headers=asked)


def test_another_site_gets_no_answer(client):
    r = _preflight(client, "https://elsewhere.example")
    assert "access-control-allow-origin" not in r.headers


def test_the_frontend_gets_its_methods_and_headers_and_no_credentials(client):
    # The tests run with DEBUG, so a dev server's origin is the frontend here.
    r = _preflight(client, "http://localhost:3006", "DELETE", "authorization, content-type")
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:3006"
    assert "access-control-allow-credentials" not in r.headers
    assert set(r.headers["access-control-allow-methods"].split(", ")) == {"GET", "POST", "PUT", "DELETE"}
    assert _preflight(client, "http://localhost:3006", "PATCH").status_code == 400
    assert _preflight(client, "http://localhost:3006", "GET", "x-something-else").status_code == 400

"""Rate limits count per person: per account when signed in, else per address.

Behind Render's proxy every request came from the proxy's address, so all
visitors shared one count. Each router also kept its own limiter.
"""
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request as StarletteRequest

from conftest import register

from app.core.rate_limit import limiter, rate_limit_key
from app.services.auth import create_access_token, create_candidate_token


@pytest.fixture()
def limits(monkeypatch):
    """Turn the shared limiter on for one test, from a clean count."""
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    yield limiter
    limiter.reset()


# A tiny app on the same limiter, so the counting is tested without calling any
# endpoint that might reach OpenAI or Tavily.
probe = FastAPI()
probe.state.limiter = limiter
probe.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@probe.get("/probe")
@limiter.limit("2/minute")
async def probe_route(request: Request):
    return {"ok": True}


def _request(headers=None, client=("203.0.113.9", 4000)):
    return StarletteRequest({
        "type": "http", "method": "GET", "path": "/", "client": client,
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
    })


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ── the key ───────────────────────────────────────────────────────────────────

def test_a_manager_is_counted_on_their_account():
    assert rate_limit_key(_request(_bearer(create_access_token({"sub": "42"})))) == "manager:42"


def test_a_candidate_is_counted_on_their_email():
    assert rate_limit_key(_request(_bearer(create_candidate_token("Dana@X.com")))) == "candidate:dana@x.com"


def test_a_bad_or_missing_token_falls_back_to_the_address():
    assert rate_limit_key(_request(_bearer("not-a-token"))) == "address:203.0.113.9"
    assert rate_limit_key(_request()) == "address:203.0.113.9"


def test_the_address_is_the_one_the_proxy_added():
    # The earlier entries come from the client and can say anything.
    headers = {"X-Forwarded-For": "1.1.1.1, 198.51.100.7"}
    assert rate_limit_key(_request(headers)) == "address:198.51.100.7"


# ── counting ──────────────────────────────────────────────────────────────────

def test_two_managers_behind_one_address_each_get_their_own_limit(limits):
    web = TestClient(probe)
    a, b = _bearer(create_access_token({"sub": "1"})), _bearer(create_access_token({"sub": "2"}))
    assert [web.get("/probe", headers=a).status_code for _ in range(3)] == [200, 200, 429]
    assert web.get("/probe", headers=b).status_code == 200


def test_a_forged_forwarded_entry_does_not_reset_the_count(limits):
    web = TestClient(probe)
    for first in ("1.1.1.1", "2.2.2.2"):
        web.get("/probe", headers={"X-Forwarded-For": f"{first}, 198.51.100.7"})
    assert web.get("/probe", headers={"X-Forwarded-For": "3.3.3.3, 198.51.100.7"}).status_code == 429
    assert web.get("/probe", headers={"X-Forwarded-For": "198.51.100.8"}).status_code == 200


def test_sign_in_counts_per_address_on_the_real_routes(client, limits):
    """The routers use this limiter too: login allows 5 a minute per address."""
    register(client, "rl@co.com")
    limiter.reset()
    attempt = {"email": "rl@co.com", "password": "wrong-password"}
    same = {"X-Forwarded-For": "198.51.100.20"}
    codes = [client.post("/api/auth/login", json=attempt, headers=same).status_code for _ in range(6)]
    assert codes == [401] * 5 + [429]
    other = client.post("/api/auth/login", json=attempt, headers={"X-Forwarded-For": "198.51.100.21"})
    assert other.status_code == 401

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


# Every endpoint that calls OpenAI, web search or GitHub, or starts a paid
# interview session. Nineteen of them had no limit at all.
SPENDING = {
    "app.api.chat": ["get_intro", "speech_to_text", "text_to_speech", "focus_chat", "draft_email",
                     "scan_resume", "resume_intelligence", "smart_questions", "credibility_analysis",
                     "automate_ranking", "score_answer", "interview_report", "export_report_pdf",
                     "send_message", "web_search", "hiring_agent", "github_analyze",
                     "generate_interview_questions", "create_interview"],
    "app.api.jarvis": ["jarvis_chat"],
    "app.api.realtime": ["create_realtime_session", "checkpoint", "finalize"],
    "app.api.livekit_routes": ["create_room", "join_room"],
    "app.api.pipeline": ["parse_jd", "run_pipeline", "batch_action"],
    "app.api.advisor_agent": ["advisor_chat", "candidate_upload_resume"],
    "app.api.sourcer": ["start_run", "draft_outreach"],
    "app.api.candidates": ["upload_resume"],
}


def test_every_endpoint_that_spends_money_has_a_limit():
    # slowapi records each decorated endpoint as "module.function".
    limited = set(limiter._route_limits)
    missing = [f"{module}.{name}" for module, names in SPENDING.items() for name in names
               if f"{module}.{name}" not in limited]
    assert missing == []

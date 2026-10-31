"""A failure is a real error with a plain message, not a 200 with its insides.

Eight chat endpoints and the candidate's advisor caught every exception and
answered 200 with the exception's own text: as the chat's reply, the advisor's
answer, an email body, or an "error" field the pages then showed as if it were
the result. Text to speech and the ranking put it in the error message.
"""
import pytest

from conftest import auth_headers, register

from app.services.auth import create_candidate_token

SECRET = "internal detail from deep inside"


def _boom(*args, **kwargs):
    raise RuntimeError(SECRET)


async def _aboom(*args, **kwargs):
    raise RuntimeError(SECRET)


def _assert_plain_failure(r, message, status=502):
    assert r.status_code == status, r.text
    assert r.json()["detail"] == message
    assert SECRET not in r.text


@pytest.fixture()
def manager(client):
    tok, m = register(client, "err@co.com")
    return auth_headers(tok)


@pytest.fixture()
def broken_lookup(monkeypatch):
    """The first step of the candidate endpoints fails."""
    from app.api import chat
    monkeypatch.setattr(chat, "_get_candidate", _boom)


def test_the_chat(client, manager, monkeypatch):
    from app.services.resume_rag import resume_rag
    monkeypatch.setattr(resume_rag, "chat", _aboom)
    r = client.post("/api/chat/send", headers=manager, json={"message": "hi", "candidate_ids": []})
    _assert_plain_failure(r, "The assistant couldn't answer just now. Please try again.")


def test_the_focus_chat(client, manager, broken_lookup):
    r = client.post("/api/chat/focus", headers=manager, json={"message": "hi", "candidate_id": 1})
    _assert_plain_failure(r, "The assistant couldn't answer just now. Please try again.")


def test_the_evaluation(client, manager, broken_lookup):
    r = client.post("/api/chat/hiring-agent", headers=manager, json={"candidate_id": 1, "role": "Dev"})
    _assert_plain_failure(r, "The evaluation couldn't be completed. Please try again.")


def test_the_email_draft(client, manager, broken_lookup):
    r = client.post("/api/chat/draft-email", headers=manager, json={"candidate_id": 1, "email_type": "interview"})
    _assert_plain_failure(r, "Couldn't draft the email. Please try again.")


def test_an_email_for_no_candidate_is_not_found(client, manager):
    """"Candidate not found." used to arrive as the email's body."""
    r = client.post("/api/chat/draft-email", headers=manager, json={"candidate_id": 999, "email_type": "interview"})
    _assert_plain_failure(r, "Candidate not found", status=404)


def test_the_github_analysis(client, manager, broken_lookup):
    r = client.post("/api/chat/github-analyze", headers=manager, json={"candidate_id": 1})
    _assert_plain_failure(r, "Couldn't analyse the GitHub profile. Please try again.")


def test_the_profile_scan(client, manager, broken_lookup):
    r = client.post("/api/chat/scan-resume", headers=manager, json={"candidate_id": 1})
    _assert_plain_failure(r, "Couldn't scan this candidate's profiles. Please try again.")


def test_calendly(client, manager, monkeypatch):
    import httpx
    from app.core.config import settings
    monkeypatch.setattr(settings, "calendly_token", "cal-token")
    monkeypatch.setattr(httpx, "AsyncClient", _boom)
    r = client.get("/api/chat/calendly-link", headers=manager)
    _assert_plain_failure(r, "Couldn't reach Calendly. Please try again.")


def test_speech_to_text(client, manager, monkeypatch):
    from app.tools.voice_tool import voice_tool
    monkeypatch.setattr(voice_tool, "speech_to_text", _aboom)
    r = client.post("/api/chat/speech-to-text", headers=manager,
                    files={"audio": ("a.webm", b"\x1a\x45\xdf\xa3 not much audio", "audio/webm")})
    _assert_plain_failure(r, "Couldn't turn the recording into text. Please try again.")


def test_text_to_speech(client, manager, monkeypatch):
    from app.tools.voice_tool import voice_tool
    monkeypatch.setattr(voice_tool, "text_to_speech", _aboom)
    r = client.post("/api/chat/text-to-speech", headers=manager, json={"text": "Hello there"})
    _assert_plain_failure(r, "Couldn't read that out. Please try again.")


def test_the_ranking(client, manager, monkeypatch):
    from app.services.resume_rag import resume_rag
    from app.tools.openai_tool import openai_tool
    me = client.get("/api/auth/me", headers=manager).json()["id"]
    resume_rag.candidates.setdefault(me, {})[5] = {"id": 5, "name": "Ada", "is_resume": True, "skills": []}
    monkeypatch.setattr(openai_tool, "structured_call", _aboom)
    r = client.post("/api/chat/automate-ranking", headers=manager, json={"role": "Dev"})
    _assert_plain_failure(r, "The ranking couldn't be completed. Please try again.")


def test_the_candidates_advisor(client, monkeypatch):
    from app.api import advisor_agent

    class Broken:
        class chat:
            class completions:
                create = staticmethod(_aboom)
    monkeypatch.setattr(advisor_agent, "_client", Broken())
    r = client.post("/api/advisor/chat", json={"message": "How is my résumé?", "mode": "general"},
                    headers={"Authorization": f"Bearer {create_candidate_token('adv-err@x.com')}"})
    _assert_plain_failure(r, "Sorry, I couldn't answer that just now. Please try again.")


# ── in plain words: the reason, never the exception's text ────────────────────

def test_the_words_for_a_failure_give_the_reason_and_never_its_text():
    from app.core.errors import AGAIN, BUSY, SLOW, UNREACHABLE, friendly_error, friendly_status
    connection_error = type("APIConnectionError", (Exception,), {})
    rate_limited = RuntimeError(SECRET)
    rate_limited.status_code = 429
    cases = [
        (type("RateLimitError", (Exception,), {})(SECRET), BUSY),
        (rate_limited, BUSY),
        (TimeoutError(SECRET), SLOW),
        # OpenAI's timeout is a kind of its connection error.
        (type("APITimeoutError", (connection_error,), {})(SECRET), SLOW),
        (connection_error(SECRET), UNREACHABLE),
        (ConnectionError(SECRET), UNREACHABLE),
        (KeyError(SECRET), AGAIN),
    ]
    for exc, reason in cases:
        assert friendly_error(exc, "It failed.") == f"It failed. {reason}", type(exc).__name__
    assert friendly_status(429, "It failed.") == f"It failed. {BUSY}"
    assert friendly_status(500, "It failed.") == f"It failed. {AGAIN}"


def _voice_interview(client):
    import asyncio
    from app.core import database
    from app.services import db_service
    _, m = register(client, "rt-err@co.com")

    async def make():
        async with database.async_session() as db:
            cand = await db_service.create_candidate_db(db, {"name": "Cand", "email": "rt@x.com"}, manager_id=m["id"])
            await db_service.create_candidate_access(db, "rt@x.com", "Cand", cand.id, manager_id=m["id"])
            iv = await db_service.create_interview(db, {
                "candidate_id": cand.id, "manager_id": m["id"], "candidate_email": "rt@x.com",
                "role": "Dev", "mode": "conversational",
            })
            return iv.id
    return asyncio.get_event_loop().run_until_complete(make())


@pytest.fixture()
def openai_answers(monkeypatch):
    """What OpenAI does when asked for a realtime session, set by each test."""
    import httpx
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    behaviour = {}
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(
        transport=httpx.MockTransport(lambda request: behaviour["answer"](request)), **kw))
    return behaviour


def _start(client, interview_id):
    return client.post("/api/realtime/session",
                       headers={"Authorization": f"Bearer {create_candidate_token('rt@x.com')}"},
                       json={"interview_id": interview_id, "candidate_email": "rt@x.com", "consent": True})


def test_a_voice_interview_when_openai_cant_be_reached(client, openai_answers):
    import httpx

    def unreachable(request):
        raise httpx.ConnectError(SECRET)
    openai_answers["answer"] = unreachable
    r = _start(client, _voice_interview(client))
    _assert_plain_failure(r, "The interview couldn't be started. A service it depends on couldn't be reached. Try again in a moment.")


def test_a_voice_interview_openai_refuses(client, openai_answers):
    import httpx
    openai_answers["answer"] = lambda request: httpx.Response(400, text=SECRET)
    r = _start(client, _voice_interview(client))
    _assert_plain_failure(r, "The interview couldn't be started. Try again in a moment.")


def test_jarvis(client, manager, monkeypatch):
    import openai
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")

    class Broken:
        def __init__(self, **kwargs):
            pass

        class chat:
            class completions:
                create = staticmethod(_aboom)
    monkeypatch.setattr(openai, "AsyncOpenAI", Broken)
    # With a role, so the question reaches the model rather than "what role?".
    r = client.post("/api/jarvis/chat", headers=manager, json={"message": "Who stands out?", "context": {"role": "Dev"}})
    _assert_plain_failure(r, "Jarvis couldn't answer. Try again in a moment.", status=500)


def test_a_batchs_interviews_and_emails(client, monkeypatch):
    import asyncio
    import json
    from app.agents.hr_agent import hr_agent
    from app.core import database
    from app.services import db_service
    from app.services.email_service import email_service
    from app.services.resume_rag import resume_rag
    tok, m = register(client, "batch-err@co.com")

    async def seed():
        async with database.async_session() as db:
            return (await db_service.create_candidate_db(db, {"name": "Cand", "text": "Cand\ncand.one@x.com"}, manager_id=m["id"])).id
    cid = asyncio.get_event_loop().run_until_complete(seed())
    resume_rag.candidates.setdefault(m["id"], {})[cid] = {
        "id": cid, "manager_id": m["id"], "name": "Cand", "text": "Cand\ncand.one@x.com", "is_resume": True,
    }

    def batch():
        r = client.post("/api/pipeline/batch-action", headers=auth_headers(tok),
                        json={"candidate_ids": [cid], "role": "Dev", "send_emails": True})
        assert r.status_code == 200, r.text
        assert SECRET not in r.text
        return r.json()["outcomes"][0]

    monkeypatch.setattr(hr_agent, "draft_email", _aboom)
    monkeypatch.setattr(email_service, "_sg", object())
    monkeypatch.setattr(email_service, "send_interview_invitation", _aboom)
    drafted_and_sent = batch()
    assert drafted_and_sent["email_error"] == "The email couldn't be drafted, so a standard one is here instead. Try again in a moment."
    assert drafted_and_sent["email_send_error"] == "The email couldn't be sent. Try again in a moment."

    monkeypatch.setattr(db_service, "create_interview", _aboom)
    created = batch()
    assert created["interview_error"] == "The interview couldn't be created. Try again in a moment."
    assert json.dumps(created).count(SECRET) == 0


def test_the_chats_own_failure(client, manager, monkeypatch):
    """Inside the chat, which caught its failure and answered it as the reply."""
    from app.services.resume_rag import resume_rag
    asked = []

    async def fails(*args, **kwargs):
        asked.append(True)
        raise RuntimeError(SECRET)

    class Broken:
        ainvoke = staticmethod(fails)
    me = client.get("/api/auth/me", headers=manager).json()["id"]
    resume_rag.candidates.setdefault(me, {})[6] = {"id": 6, "name": "Ada", "is_resume": True, "skills": [], "text": "Ada"}
    monkeypatch.setattr(resume_rag, "vectordb", object())
    monkeypatch.setattr(resume_rag, "llm", Broken())
    r = client.post("/api/chat/send", headers=manager, json={"message": "hi", "candidate_ids": [6]})
    assert asked
    _assert_plain_failure(r, "The assistant couldn't answer just now. Please try again.")

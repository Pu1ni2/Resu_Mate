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

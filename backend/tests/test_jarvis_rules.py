"""Jarvis's instructions. An interview it asks for waits for the manager to
confirm it on screen, and it sends no email itself, so it must not say that
either is done: it used to answer "Setting that up." above the card asking."""
import json
from types import SimpleNamespace

from conftest import auth_headers, register

from app.api.jarvis import JARVIS_SYSTEM_PROMPT


def test_jarvis_is_told_interviews_wait_for_the_manager():
    assert "batch_action and create_interview wait for the manager to confirm them on screen" in JARVIS_SYSTEM_PROMPT


def test_jarvis_is_told_it_sends_no_email_and_says_nothing_is_done():
    assert "no email is sent from here" in JARVIS_SYSTEM_PROMPT
    assert "never say an interview is created or an email is sent" in JARVIS_SYSTEM_PROMPT


# ── what the model answers, passed on ────────────────────────────────────────

def _the_model_answers(monkeypatch, answer):
    import openai
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")

    async def create(**kwargs):
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(answer)))])

    class Client:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "AsyncOpenAI", Client)


def _ask(client, email, message):
    token, _ = register(client, email)
    r = client.post("/api/jarvis/chat", headers=auth_headers(token), json={
        "message": message, "context": {"role": "Dev"}, "candidates_summary": [{"id": 1, "name": "Ada"}]})
    assert r.status_code == 200, r.text
    return r.json()


def test_the_models_word_confirms_nothing(client, monkeypatch):
    # The page acted on a "confirmed" in the model's answer as on the
    # manager's yes; a résumé the model read could ask it to say so.
    _the_model_answers(monkeypatch, {"reply": "Done.", "action": "batch_action", "action_params": {
        "candidate_ids": [1], "role": "Dev", "send_emails": True, "confirmed": True}})
    said = _ask(client, "jr1@co.com", "Invite Ada")
    assert said["action"] == "batch_action" and said["action_params"]["candidate_ids"] == [1]
    assert "confirmed" not in said["action_params"]


def test_the_model_sends_no_email(client, monkeypatch):
    # Only a draft's Send button sends one.
    _the_model_answers(monkeypatch, {"reply": "Sending.", "action": "send_invites", "action_params": {
        "invites": [{"interview_id": 1, "subject": "Come in", "body": "Words the manager never read."}]}})
    said = _ask(client, "jr2@co.com", "Send it")
    assert said["action"] is None and not said["action_params"]

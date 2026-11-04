""""Hide names" on the account keeps candidates' names from the AI.

It was the request's word alone, so Jarvis, the online lookup and a batch's
email drafts sent every name and address, and the file's chat sent the name
and the whole résumé text, asking the AI only not to use the name.
"""
import json
from types import SimpleNamespace

import pytest

from conftest import auth_headers, register

from app.services.hidden_names import NO_LOOKUP, hides_names, scrub, stand_ins
from app.services.resume_rag import resume_rag

ADA = {
    "id": 1, "name": "Ada Lovelace", "email": "ada.lovelace@x.com", "is_resume": True, "skills": ["Python"],
    "predicted_role": "Engineer", "summary": "Ada Lovelace builds engines.",
    "text": "Ada Lovelace\nada.lovelace@x.com | (555) 010-1234 | github.com/ada-l\nEngineer, 2019 - 2023",
}


def _hiding(client, email):
    """A manager with names hidden, and Ada, stored as an upload leaves her."""
    import asyncio
    from app.core import database
    from app.services import db_service
    token, user = register(client, email)
    r = client.put("/api/auth/preferences", headers=auth_headers(token), json={"hide_names": True})
    assert r.status_code == 200, r.text

    async def row():
        async with database.async_session() as db:
            await db_service.create_candidate_db(db, dict(ADA), manager_id=user["id"])
    asyncio.get_event_loop().run_until_complete(row())
    resume_rag.candidates.setdefault(user["id"], {})[1] = dict(ADA, manager_id=user["id"])
    return token, user


def test_the_account_or_the_request_hides_names():
    assert hides_names(SimpleNamespace(hide_names=True)) is True
    assert hides_names(SimpleNamespace(hide_names=False), asked=True) is True
    assert hides_names(SimpleNamespace(hide_names=False)) is False


def test_stand_ins_number_candidates_as_the_pages_do(client):
    _, user = register(client, "stand@x.com")
    drawer = resume_rag.candidates.setdefault(user["id"], {})
    for cid in (9, 3, 5):
        drawer[cid] = {"id": cid, "name": f"Person {cid}"}
    assert stand_ins(user["id"]) == {3: "Candidate 1", 5: "Candidate 2", 9: "Candidate 3"}


def test_scrubbing_takes_out_the_name_and_contact_details_only():
    out = scrub(ADA["text"] + "\nAdams Street. Lovelace led.", "Ada Lovelace")
    assert out == "The Candidate\n[email] | [phone] | [link]\nEngineer, 2019 - 2023\nAdams Street. The Candidate led."


def test_the_files_chat_gives_the_ai_no_name_or_contact(client, monkeypatch):
    from app.tools.openai_tool import openai_tool
    seen = []

    class Model:
        async def ainvoke(self, messages):
            seen.extend(m.content for m in messages)
            return SimpleNamespace(content="Ada Lovelace has strong Python.")
    monkeypatch.setattr(openai_tool, "llm", Model())
    token, _ = _hiding(client, "focus@x.com")
    r = client.post("/api/chat/focus", headers=auth_headers(token), json={
        "candidate_id": 1, "message": "Tell me about Ada", "conversation_history": [
            {"role": "assistant", "content": "Ada Lovelace's file is open."}],
    })
    assert r.status_code == 200, r.text
    told = "\n".join(seen)
    for detail in ("Ada", "Lovelace", "ada.lovelace@x.com", "010-1234", "github.com/ada-l"):
        assert detail not in told
    assert "Name: The Candidate" in told
    assert "Lovelace" not in r.json()["response"]


def test_the_online_lookup_is_refused_while_names_are_hidden(client):
    token, _ = _hiding(client, "lookup@x.com")
    r = client.post("/api/chat/scan-resume", headers=auth_headers(token), json={"candidate_id": 1})
    assert r.status_code == 403
    assert r.json()["detail"] == NO_LOOKUP


def test_jarvis_is_told_each_person_as_the_pages_show_them(client, monkeypatch):
    import openai
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    seen = []

    async def create(**kwargs):
        seen.extend(m["content"] for m in kwargs["messages"])
        reply = json.dumps({"reply": "Candidate 1 stands out.", "action": None, "action_params": None})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=reply))])

    class Client:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, "AsyncOpenAI", Client)
    token, _ = _hiding(client, "jarvis@x.com")
    r = client.post("/api/jarvis/chat", headers=auth_headers(token), json={
        "message": "Who stands out?", "context": {"role": "Dev"},
        "candidates_summary": [{"id": 1, "name": "Ada Lovelace", "email": "ada.lovelace@x.com",
                                "github_url": "https://github.com/ada-l"}],
    })
    assert r.status_code == 200, r.text
    told = "\n".join(seen)
    assert "Candidate 1" in told
    for detail in ("Ada Lovelace", "ada.lovelace@x.com", "github.com/ada-l"):
        assert detail not in told


def test_a_batchs_drafts_are_written_without_the_name(client, monkeypatch):
    from app.agents.hr_agent import hr_agent
    asked = []

    async def draft_email(**kwargs):
        asked.append(kwargs["anonymize"])
        return {"subject": "Interview", "body": "Hi there"}
    monkeypatch.setattr(hr_agent, "draft_email", draft_email)
    token, _ = _hiding(client, "batch@x.com")
    r = client.post("/api/pipeline/batch-action", headers=auth_headers(token),
                    json={"candidate_ids": [1], "role": "Dev"})
    assert r.status_code == 200, r.text
    assert asked == [True]


@pytest.mark.asyncio
async def test_a_draft_without_the_name_greets_without_one(monkeypatch):
    from app.agents.hr_agent import hr_agent
    from app.tools.openai_tool import openai_tool
    prompts = []

    async def structured_call(prompt, system="", json_mode=False):
        prompts.append(prompt)
        return "SUBJECT: Hello\nBODY:\nHi there,\nWould you talk with us?"
    monkeypatch.setattr(openai_tool, "structured_call", structured_call)
    await hr_agent.draft_email(ADA, "interest", anonymize=True)
    assert "Ada" not in prompts[0]
    assert 'Greet them as "Hi there"' in prompts[0]

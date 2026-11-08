"""The selected-candidates chat's conversation, kept in the database.

It was kept in the server's memory: a restart, or the free plan's sleep, lost
it, and each server process had its own. The page started afresh on every
visit while the server remembered, so the chat answered from things it no
longer showed; and nothing forgot it when the people it talked about were
deleted.
"""
import asyncio
from types import SimpleNamespace

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _rows(manager_id):
    from sqlalchemy import select
    from app.core import database
    from app.models.state import ChatHistory

    async def read():
        async with database.async_session() as db:
            return (await db.execute(select(ChatHistory).where(ChatHistory.manager_id == manager_id))).scalars().all()
    return _run(read())


class _Model:
    """Answers each message, and keeps what it was asked."""

    def __init__(self):
        self.asked = []

    async def ainvoke(self, messages):
        self.asked.append(" ".join(str(m.content) for m in messages))
        return SimpleNamespace(content=f"Answer {len(self.asked)}.")


def _chatting(client, monkeypatch, email):
    from app.services.resume_rag import resume_rag
    tok, m = register(client, email)
    resume_rag.candidates.setdefault(m["id"], {})[6] = {
        "id": 6, "name": "Ada", "is_resume": True, "skills": ["Python"], "text": "Ada"}
    model = _Model()
    monkeypatch.setattr(resume_rag, "llm", model)

    def say(text):
        r = client.post("/api/chat/send", headers=auth_headers(tok), json={"message": text, "candidate_ids": [6]})
        assert r.status_code == 200, r.text
    return tok, m, model, say


def test_the_conversation_is_kept_in_the_database_and_shown_again(client, monkeypatch):
    tok, m, model, say = _chatting(client, monkeypatch, "keep@co.com")
    say("Who knows Python best?")
    assert len(_rows(m["id"])) == 1
    shown = client.get("/api/chat/history", headers=auth_headers(tok)).json()["messages"]
    assert shown == [{"role": "user", "content": "Who knows Python best?"},
                     {"role": "assistant", "content": "Answer 1."}]
    # The next message is answered knowing the conversation so far.
    say("And after her?")
    assert "Who knows Python best?" in model.asked[1]


def test_each_manager_sees_only_their_own_conversation(client, monkeypatch):
    _, _, _, say = _chatting(client, monkeypatch, "mine@co.com")
    say("Is Ada strong?")
    other, _ = register(client, "theirs@co.com")
    assert client.get("/api/chat/history", headers=auth_headers(other)).json() == {"messages": []}


def test_deleting_candidates_forgets_the_conversation(client, monkeypatch):
    tok, m, _, say = _chatting(client, monkeypatch, "delete@co.com")
    say("Is Ada strong?")
    assert len(_rows(m["id"])) == 1
    assert client.delete("/api/candidates", headers=auth_headers(tok)).status_code == 200
    assert _rows(m["id"]) == []


def test_an_erasure_forgets_the_conversations_of_the_managers_who_held_them(client, monkeypatch):
    from app.core import database
    from app.services import db_service, state_service
    from app.services.erasure import erase_person
    _, holder = register(client, "holder@co.com")
    _, other = register(client, "other@co.com")

    async def seed():
        async with database.async_session() as db:
            await db_service.create_candidate_db(db, {"name": "Ada", "email": "ada@x.com"}, manager_id=holder["id"])
            for manager in (holder, other):
                await state_service.remember_chat(db, "default", manager["id"], "Is Ada strong?", "Yes.")
    _run(seed())

    async def erase():
        async with database.async_session() as db:
            await erase_person(db, "ada@x.com")
    _run(erase())
    assert _rows(holder["id"]) == []
    # A manager who never held them keeps theirs.
    assert len(_rows(other["id"])) == 1

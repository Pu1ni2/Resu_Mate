"""Chat history must not cross tenants.

Regression guard for a live leak: chat_histories was keyed by conversation_id
alone, and ChatRequest.conversation_id defaults to the literal string "default".
So every manager who did not set an explicit id shared one bucket, and that
history was replayed verbatim into the next manager's prompt — one tenant's
questions, and the model's answers about their candidates, entering another
tenant's LLM context.

These tests exercise the store directly rather than through /chat/send, because
/chat/send needs a live OpenAI key and the isolation property is a property of
the key, not of the model call. The store is the database now (state_service).
"""
import asyncio

from conftest import register, auth_headers

from app.api import chat as chat_api


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _remember(manager_id, conversation, question, answer):
    from app.core import database
    from app.services import state_service

    async def remember():
        async with database.async_session() as db:
            await state_service.remember_chat(db, chat_api._conversation(conversation), manager_id, question, answer)
    _run(remember())


def _history(manager_id, conversation="default"):
    from app.core import database
    from app.services import state_service

    async def read():
        async with database.async_session() as db:
            return await state_service.read_chat_history(db, conversation, manager_id)
    return _run(read())


def test_same_conversation_id_does_not_share_across_managers(client):
    _, one = register(client, "one@co.com")
    _, two = register(client, "two@co.com")
    # Both managers use the default conversation id — the exact collision case.
    _remember(one["id"], "default", "Is Maya strong?", "Yes, 92.")
    _remember(two["id"], "default", "Who applied?", "Two people.")

    a, b = _history(one["id"]), _history(two["id"])

    assert len(a) == 2 and len(b) == 2
    # Neither manager's text may appear in the other's history.
    assert "Maya" not in str(b)
    assert "applied" not in str(a)


def test_history_lookup_is_scoped_to_the_caller(client):
    _, one = register(client, "one2@co.com")
    _, two = register(client, "two2@co.com")
    _remember(one["id"], "default", "secret question", "secret answer")
    # A different manager, same id, must see nothing.
    assert _history(two["id"]) == []


def test_blank_conversation_id_is_the_default_one(client):
    _, one = register(client, "one3@co.com")
    _, two = register(client, "two3@co.com")
    _remember(one["id"], "", "a", "b")
    _remember(two["id"], None, "c", "d")
    assert _history(one["id"])[0]["content"] == "a"
    assert _history(two["id"])[0]["content"] == "c"


def test_clear_only_removes_the_callers_history(client):
    tok_a, user_a = register(client, "a@co.com")
    tok_b, user_b = register(client, "b@co.com")

    _remember(user_a["id"], "default", "mine", "ok")
    _remember(user_b["id"], "default", "theirs", "ok")

    r = client.post("/api/chat/clear", headers=auth_headers(tok_a))
    assert r.status_code == 200, r.text

    # A's history is gone; B's survives. This previously called .clear() on the
    # whole store, so any authenticated user wiped everyone's conversations.
    assert _history(user_a["id"]) == []
    assert _history(user_b["id"]) != []


def test_per_conversation_message_cap_still_applies(client):
    _, one = register(client, "cap@co.com")
    for i in range(30):
        _remember(one["id"], "default", f"q{i}", f"a{i}")
    convo = _history(one["id"])
    assert len(convo) == 20
    # Newest kept, oldest dropped.
    assert convo[-1]["content"] == "a29"


# ── Method / parameter contract ───────────────────────────────────────────────
# The frontend called DELETE /chat/clear (backend registers POST) and passed
# ?candidate_count= to /chat/intro (the parameter is `count`). Both failed
# silently: the 405 was swallowed by a .catch() that cleared local state anyway,
# and FastAPI ignored the unknown query param so the intro always rendered as if
# nothing was selected. Pinning both here because neither surfaced as an error.

def test_clear_is_post_not_delete(client):
    tok, _ = register(client, "contract@co.com")
    assert client.post("/api/chat/clear", headers=auth_headers(tok)).status_code == 200
    # If someone adds a DELETE handler later this is fine to update — the point
    # is that the frontend and backend agree on one verb.
    assert client.delete("/api/chat/clear", headers=auth_headers(tok)).status_code == 405


def test_intro_reads_the_count_parameter(client):
    tok, _ = register(client, "contract2@co.com")
    r = client.get("/api/chat/intro?count=3", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    # The old name must not be what the endpoint depends on.
    r2 = client.get("/api/chat/intro?candidate_count=3", headers=auth_headers(tok))
    assert r2.status_code == 200
    assert r.json() != r2.json() or "3" in str(r.json()), (
        "count= should affect the intro; if these are identical the parameter "
        "is being ignored again"
    )

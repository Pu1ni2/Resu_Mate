"""Chat history must not cross tenants.

Regression guard for a live leak: chat_histories was keyed by conversation_id
alone, and ChatRequest.conversation_id defaults to the literal string "default".
So every manager who did not set an explicit id shared one bucket, and that
history was replayed verbatim into the next manager's prompt — one tenant's
questions, and the model's answers about their candidates, entering another
tenant's LLM context.

These tests exercise the store directly rather than through /chat/send, because
/chat/send needs a live OpenAI key and the isolation property is a property of
the key, not of the model call.
"""
from conftest import register, auth_headers

from app.api import chat as chat_api


def _reset():
    chat_api.chat_histories.clear()


def test_same_conversation_id_does_not_share_across_managers():
    _reset()
    # Both managers use the default conversation id — the exact collision case.
    chat_api._remember_chat(1, "default", "Is Maya strong?", "Yes, 92.")
    chat_api._remember_chat(2, "default", "Who applied?", "Two people.")

    a = chat_api.chat_histories[chat_api._chat_key(1, "default")]
    b = chat_api.chat_histories[chat_api._chat_key(2, "default")]

    assert len(a) == 2 and len(b) == 2
    # Neither manager's text may appear in the other's history.
    assert "Maya" not in str(b)
    assert "applied" not in str(a)


def test_history_lookup_is_scoped_to_the_caller():
    _reset()
    chat_api._remember_chat(1, "default", "secret question", "secret answer")
    # A different manager, same id, must see nothing.
    assert chat_api.chat_histories.get(chat_api._chat_key(2, "default"), []) == []


def test_key_includes_the_manager_id():
    # Guards the shape itself: if someone reverts to a bare string key, the
    # collision returns silently and no other test here would catch it.
    key = chat_api._chat_key(7, "abc")
    assert isinstance(key, tuple)
    assert key[0] == 7
    assert 7 in key


def test_blank_conversation_id_still_scopes_by_manager():
    _reset()
    chat_api._remember_chat(1, "", "a", "b")
    chat_api._remember_chat(2, None, "c", "d")
    assert chat_api.chat_histories[chat_api._chat_key(1, "default")][0]["content"] == "a"
    assert chat_api.chat_histories[chat_api._chat_key(2, "default")][0]["content"] == "c"


def test_clear_only_removes_the_callers_history(client):
    _reset()
    tok_a, user_a = register(client, "a@co.com")
    tok_b, user_b = register(client, "b@co.com")

    chat_api._remember_chat(user_a["id"], "default", "mine", "ok")
    chat_api._remember_chat(user_b["id"], "default", "theirs", "ok")

    r = client.post("/api/chat/clear", headers=auth_headers(tok_a))
    assert r.status_code == 200, r.text

    # A's history is gone; B's survives. This previously called .clear() on the
    # whole dict, so any authenticated user wiped everyone's conversations.
    assert chat_api.chat_histories.get(chat_api._chat_key(user_a["id"], "default")) is None
    assert chat_api.chat_histories.get(chat_api._chat_key(user_b["id"], "default")) is not None


def test_per_conversation_message_cap_still_applies():
    _reset()
    for i in range(30):
        chat_api._remember_chat(1, "default", f"q{i}", f"a{i}")
    convo = chat_api.chat_histories[chat_api._chat_key(1, "default")]
    assert len(convo) == chat_api._CHAT_MAX_MESSAGES_PER_CONVO
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

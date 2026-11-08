"""The career advisor answers from the résumé saved now.

It kept a copy of each candidate's résumé in the server's memory, with no
limit, and answered from it: a newer upload, or an erasure, that another
server process handled left it answering from the old one.
"""
import asyncio
import json

import httpx
from openai import AsyncOpenAI

from app.services import state_service
from app.services.auth import create_candidate_token


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _model(asked):
    """The real async client, answered by a fake server that keeps each request."""
    def handler(request):
        asked.append(json.loads(request.content))
        return httpx.Response(200, json={
            "id": "c1", "object": "chat.completion", "created": 0, "model": "gpt-4o",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": '{"predicted_role": "Engineer"}'}}],
        })
    return AsyncOpenAI(api_key="sk-test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_the_advisor_answers_from_the_resume_saved_now(client, monkeypatch):
    from app.api import advisor_agent
    from app.core import database
    asked = []
    monkeypatch.setattr(advisor_agent, "_client", _model(asked))
    signed_in = {"Authorization": f"Bearer {create_candidate_token('dana@x.com')}"}
    r = client.post("/api/advisor/upload-resume", headers=signed_in,
                    files={"file": ("dana.txt", b"Dana Reyes, COBOL programmer for twenty years.", "text/plain")})
    assert r.status_code == 200, r.text

    async def uploaded_elsewhere():
        # As another server process would save a newer upload.
        async with database.async_session() as db:
            await state_service.update_advisor_session(db, "dana@x.com", resume_text="Dana Reyes, Rust engineer.")
    _run(uploaded_elsewhere())
    r = client.post("/api/advisor/chat", headers=signed_in, json={"message": "How can I improve it?", "mode": "resume_coach"})
    assert r.status_code == 200, r.text
    prompt = json.dumps(asked[-1])
    assert "Rust engineer" in prompt
    assert "COBOL" not in prompt
    assert not hasattr(advisor_agent, "_session_cache")

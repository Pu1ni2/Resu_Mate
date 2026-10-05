"""Calls that wait on OpenAI must not hold up the server.

The voice tool, the career advisor and the résumé upload are async, but they
made blocking calls inside: the sync OpenAI client, time.sleep, and the
embedding of a résumé's chunks. Each one froze every other request until it
returned. These run the real async client against a fake OpenAI server.
"""
import asyncio
import threading
import time

import httpx
import pytest
from openai import AsyncOpenAI

from conftest import register, auth_headers


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _fake_openai(reply="Lead with your impact."):
    """The real async client, answered by a fake server."""
    def handler(request):
        path = request.url.path
        if path.endswith("/audio/speech"):
            return httpx.Response(200, content=b"MP3", headers={"content-type": "audio/mpeg"})
        if path.endswith("/audio/transcriptions"):
            return httpx.Response(200, json={"text": "hello there"})
        return httpx.Response(200, json={
            "id": "c1", "object": "chat.completion", "created": 0, "model": "gpt-4o",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": reply}}],
        })
    return AsyncOpenAI(api_key="sk-test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


# ── voice ─────────────────────────────────────────────────────────────────────

def test_the_voice_tool_builds_an_async_client(monkeypatch):
    from app.core.config import settings
    from app.tools.voice_tool import VoiceTool
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    assert isinstance(VoiceTool().client, AsyncOpenAI)


def test_the_voice_tool_speaks_and_transcribes_through_it(monkeypatch):
    from app.tools.voice_tool import voice_tool
    monkeypatch.setattr(voice_tool, "client", _fake_openai())
    assert _run(voice_tool.text_to_speech("hi")) == b"MP3"
    assert _run(voice_tool.speech_to_text(b"audio")) == "hello there"


# ── the career advisor ────────────────────────────────────────────────────────

def test_the_advisor_builds_an_async_client(monkeypatch):
    from app.api import advisor_agent
    from app.core.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(advisor_agent, "_client", None)
    assert isinstance(advisor_agent._openai(), AsyncOpenAI)


def test_the_advisor_answers_through_it(client, monkeypatch):
    from app.api import advisor_agent
    from app.services.auth import create_candidate_token
    monkeypatch.setattr(advisor_agent, "_client", _fake_openai("Lead with your impact."))
    r = client.post(
        "/api/advisor/chat",
        headers={"Authorization": f"Bearer {create_candidate_token('ada@x.com')}"},
        json={"message": "How do I improve my résumé?", "mode": "resume_coach"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == "Lead with your impact."


# ── uploads ───────────────────────────────────────────────────────────────────

def test_an_upload_never_sleeps_the_server(client, monkeypatch):
    from app.services.resume_rag import resume_rag
    tok, _ = register(client, "nb1@co.com")

    def no_blocking_sleep(seconds):
        raise AssertionError(f"time.sleep({seconds}) in an async handler blocks every request")

    async def analysed(file_path, file_name, file_hash=None, manager_id=None):
        return {"id": 7, "manager_id": manager_id, "name": "Ada", "email": "ada@x.com",
                "file_name": file_name, "is_resume": True, "text": "Ada"}

    monkeypatch.setattr(time, "sleep", no_blocking_sleep)
    monkeypatch.setattr(resume_rag, "add_resume", analysed)
    r = client.post("/api/candidates/upload", headers=auth_headers(tok),
                    files={"file": ("ada.txt", b"Ada Lovelace, ada@x.com, engineer. " * 4, "text/plain")})
    assert r.status_code == 200, r.text


def test_a_resume_is_read_and_embedded_off_the_event_loop(tmp_path, monkeypatch):
    from app.services.resume_rag import resume_rag
    seen = {}

    class FakeIndex:
        def add_documents(self, documents):
            seen["thread"] = threading.get_ident()
            seen["chunks"] = len(documents)

    async def analysed(*a, **k):
        return {"summary": "", "skills": []}

    read_text = resume_rag._extract_text

    def reading(*args):
        seen["reader"] = threading.get_ident()
        return read_text(*args)

    monkeypatch.setattr(resume_rag, "vectordb", FakeIndex())
    monkeypatch.setattr(resume_rag, "_analyze_resume", analysed)
    monkeypatch.setattr(resume_rag, "_extract_text", reading)
    monkeypatch.setattr(resume_rag, "candidates", {})
    monkeypatch.setattr(resume_rag, "candidate_counter", 0)
    path = tmp_path / "ada.txt"
    path.write_text("Ada Lovelace\nada@x.com\n" + "Engineer who ships. " * 30, encoding="utf-8")

    async def upload():
        seen["loop"] = threading.get_ident()
        return await resume_rag.add_resume(str(path), "ada.txt", "hash", manager_id=7)

    result = _run(upload())
    assert result["id"] == 1, result
    assert seen["chunks"] >= 1
    assert seen["thread"] != seen["loop"]
    assert seen["reader"] != seen["loop"]


@pytest.mark.parametrize("name", ["text_to_speech", "speech_to_text"])
def test_the_voice_tool_reports_a_missing_key(monkeypatch, name):
    from app.tools.voice_tool import voice_tool
    monkeypatch.setattr(voice_tool, "client", None)
    arg = "hi" if name == "text_to_speech" else b"audio"
    with pytest.raises(ValueError):
        _run(getattr(voice_tool, name)(arg))


# ── the rest of what waits on something slow ──────────────────────────────────

def test_email_is_sent_off_the_event_loop():
    from app.services.email_service import EmailService
    seen = {}

    class FakeSendGrid:
        def send(self, message):
            seen["thread"] = threading.get_ident()
            return type("Accepted", (), {"status_code": 202})()

    service = EmailService()
    service._sg = FakeSendGrid()

    async def send():
        seen["loop"] = threading.get_ident()
        return await service.send("ada@x.com", "Your code", "<p>123456</p>")

    assert _run(send()) is True
    assert seen["thread"] != seen["loop"]


def test_a_slow_scrape_neither_freezes_the_server_nor_outlasts_its_timeout(monkeypatch):
    from app.tools import browser_tool as bt
    monkeypatch.setattr(bt, "SCRAPE_TIMEOUT", 0.3)
    tool = bt.BrowserTool()
    monkeypatch.setattr(tool, "_scrape_sync", lambda url, selectors: time.sleep(1.5) or {"ok": True})

    async def scrape():
        ticks = 0

        async def ticker():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.02)
                ticks += 1

        running = asyncio.create_task(ticker())
        start = time.perf_counter()
        result = await tool.call({"url": "https://example.com"})
        elapsed = time.perf_counter() - start
        running.cancel()
        return result, elapsed, ticks

    result, elapsed, ticks = _run(scrape())
    assert "error" in result, result
    assert elapsed < 1.0, elapsed  # it gave up at the timeout
    assert ticks >= 5, ticks       # and the loop kept running meanwhile


def test_the_advisor_reads_and_analyses_an_upload_without_blocking(client, monkeypatch):
    from app.api import advisor_agent
    from app.services import state_service
    from app.services.auth import create_candidate_token
    seen = {}
    read_text = advisor_agent._resume_text
    save = state_service.update_advisor_session

    def reading(filename, content):
        seen["reader"] = threading.get_ident()
        return read_text(filename, content)

    async def saving(*a, **k):
        seen["loop"] = threading.get_ident()
        return await save(*a, **k)

    monkeypatch.setattr(advisor_agent, "_resume_text", reading)
    monkeypatch.setattr(state_service, "update_advisor_session", saving)
    monkeypatch.setattr(advisor_agent, "_client", _fake_openai('{"predicted_role": "Compiler Engineer"}'))
    monkeypatch.setitem(advisor_agent._session_cache, "nb-advisor@x.com", None)
    r = client.post(
        "/api/advisor/upload-resume",
        headers={"Authorization": f"Bearer {create_candidate_token('nb-advisor@x.com')}"},
        files={"file": ("ada.txt", b"Ada Lovelace, compiler engineer.", "text/plain")},
    )
    assert r.status_code == 200, r.text
    # The analysis came from the async client: without the await, its broad
    # except would have filled in "Professional".
    assert r.json()["data"]["predicted_role"] == "Compiler Engineer"
    assert seen["reader"] != seen["loop"]


def test_the_original_file_is_stored_off_the_event_loop(client, monkeypatch):
    from app.services.resume_rag import resume_rag
    from app.services.storage_service import storage_service
    tok, _ = register(client, "nb2@co.com")
    seen = {}

    def put(key, data, content_type="application/octet-stream"):
        seen["thread"] = threading.get_ident()
        return key

    async def analysed(file_path, file_name, file_hash=None, manager_id=None):
        seen["loop"] = threading.get_ident()
        return {"id": 8, "manager_id": manager_id, "name": "Ada", "email": "ada@x.com",
                "file_name": file_name, "is_resume": True, "text": "Ada"}

    monkeypatch.setattr(storage_service, "_client", object())  # storage "configured"
    monkeypatch.setattr(storage_service, "upload", put)
    monkeypatch.setattr(resume_rag, "add_resume", analysed)
    r = client.post("/api/candidates/upload", headers=auth_headers(tok),
                    files={"file": ("ada.txt", b"Ada Lovelace, ada@x.com, engineer. " * 4, "text/plain")})
    assert r.status_code == 200, r.text
    assert r.json()["file_object_key"]
    assert seen["thread"] != seen["loop"]

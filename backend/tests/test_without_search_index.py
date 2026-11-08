"""Uploads and the chat work without a search index.

Every upload was embedded into ChromaDB, which nothing ever searched, at the
cost of a call to OpenAI; when it failed to open, uploads and the
selected-candidates chat stopped, though the chat model worked.
"""
import asyncio
import os
from types import SimpleNamespace

from conftest import auth_headers, register

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_an_upload_needs_only_the_chat_model(tmp_path, monkeypatch):
    from app.services.resume_rag import resume_rag

    async def analysed(*a, **k):
        return {"summary": "Ships things.", "skills": ["Python"]}
    monkeypatch.setattr(resume_rag, "llm", object())
    monkeypatch.setattr(resume_rag, "_analyze_resume", analysed)
    monkeypatch.setattr(resume_rag, "candidates", {})
    monkeypatch.setattr(resume_rag, "candidate_counter", 0)
    path = tmp_path / "ada.txt"
    path.write_text("Ada Lovelace\nada@x.com\n" + "Engineer who ships. " * 30, encoding="utf-8")
    result = asyncio.get_event_loop().run_until_complete(
        resume_rag.add_resume(str(path), "ada.txt", "hash", manager_id=7))
    assert "error" not in result, result
    assert result["name"] == "Ada Lovelace" and result["skills"] == ["Python"]
    assert not hasattr(resume_rag, "vectordb")


def test_the_chat_needs_only_the_chat_model(client, monkeypatch):
    from app.services.resume_rag import resume_rag

    class Answering:
        async def ainvoke(self, messages):
            return SimpleNamespace(content="Ada has five years of Python.")
    tok, m = register(client, "noindex@co.com")
    resume_rag.candidates.setdefault(m["id"], {})[6] = {
        "id": 6, "name": "Ada", "is_resume": True, "skills": ["Python"], "text": "Ada"}
    monkeypatch.setattr(resume_rag, "llm", Answering())
    r = client.post("/api/chat/send", headers=auth_headers(tok), json={"message": "Who knows Python?", "candidate_ids": [6]})
    assert r.status_code == 200, r.text
    assert r.json()["response"] == "Ada has five years of Python."


def test_the_server_no_longer_installs_the_index():
    with open(os.path.join(BACKEND, "requirements.txt"), encoding="utf-8") as f:
        wanted = [line.split(">")[0].split("=")[0].strip().lower() for line in f if line.strip() and not line.startswith("#")]
    assert "chromadb" not in wanted and "langchain-chroma" not in wanted
    assert "langchain-openai" in wanted  # the check reads the requirements

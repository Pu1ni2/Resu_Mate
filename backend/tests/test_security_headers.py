"""Every answer from the API carries the headers that make browsers handle it
safely, and in production the one that keeps them on HTTPS. It sent none.
"""
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from app.core.security_headers import SecurityHeaders

SAFE = {"x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer"}


def _missing(answer):
    return {name: answer.headers.get(name) for name, value in SAFE.items() if answer.headers.get(name) != value}


def test_every_answer_carries_them(client):
    answers = {
        "an answer": client.get("/health"),
        "a refusal": client.get("/api/candidates"),
        "no such page": client.get("/no-such-page"),
        "a CORS preflight": client.options("/api/candidates", headers={
            "Origin": "http://localhost:3006", "Access-Control-Request-Method": "GET"}),
    }
    for kind, answer in answers.items():
        assert not _missing(answer), (kind, _missing(answer))
        # Local runs are plain HTTP, where HSTS means nothing.
        assert "strict-transport-security" not in answer.headers, kind


def test_production_also_keeps_browsers_on_https():
    app = FastAPI()

    @app.get("/x")
    async def x():
        return {"ok": True}
    app.add_middleware(SecurityHeaders, hsts=True)
    answer = TestClient(app).get("/x")
    assert answer.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert not _missing(answer)


def test_a_streamed_answer_still_streams_with_them():
    # Find Candidates streams its results as it finds them.
    app = FastAPI()

    @app.get("/stream")
    async def stream():
        async def parts():
            yield b"one\n"
            yield b"two\n"
        return StreamingResponse(parts(), media_type="application/x-ndjson")
    app.add_middleware(SecurityHeaders)
    answer = TestClient(app).get("/stream")
    assert answer.text == "one\ntwo\n"
    assert not _missing(answer)

"""Each request's id: on its answer, on its log lines, and in an error's
message, so a person can quote it and its lines can be found. There was none.
"""
import logging
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.request_context import RequestContext, install_request_ids, new_request_id


def test_every_answer_has_its_own_id(client):
    first, second = client.get("/health"), client.get("/no-such-page")
    for answer in (first, second):
        assert re.fullmatch(r"[0-9a-f]{12}", answer.headers["x-request-id"])
    assert first.headers["x-request-id"] != second.headers["x-request-id"]


def test_a_plain_id_from_a_proxy_is_kept_and_anything_else_replaced(client):
    kept = client.get("/health", headers={"X-Request-ID": "edge-7f3a9c21"})
    assert kept.headers["x-request-id"] == "edge-7f3a9c21"
    for odd in ("short", "has spaces in it", "x" * 65, "line\nbreak-1234", ""):
        assert re.fullmatch(r"[0-9a-f]{12}", new_request_id(odd)), odd


def test_a_requests_log_lines_carry_its_id(caplog):
    install_request_ids()
    app = FastAPI()

    @app.get("/work")
    async def work():
        logging.getLogger("resumate.test").info("working")
        return {}
    app.add_middleware(RequestContext)
    with caplog.at_level(logging.INFO):
        answer = TestClient(app).get("/work")
    line = next(r for r in caplog.records if r.getMessage() == "working")
    assert line.request_id == answer.headers["x-request-id"]


def test_lines_outside_a_request_say_so(caplog):
    install_request_ids()
    with caplog.at_level(logging.INFO):
        logging.getLogger("resumate.test").info("starting")
    assert caplog.records[-1].request_id == "-"


def test_an_unexpected_error_gives_the_reference_to_quote(monkeypatch, caplog):
    import main
    from app.services import interview_modes

    def broken():
        raise RuntimeError("the check broke")
    monkeypatch.setattr(interview_modes, "avatar_available", broken)
    with caplog.at_level(logging.ERROR), TestClient(main.app, raise_server_exceptions=False) as c:
        answer = c.get("/api/features")
    assert answer.status_code == 500
    reference = answer.headers["x-request-id"]
    assert answer.json()["error"]["reference"] == reference
    # The pages show `detail`.
    assert f"quote reference {reference}" in answer.json()["detail"]
    logged = next(r for r in caplog.records if r.getMessage().startswith("Unhandled error"))
    assert logged.request_id == reference

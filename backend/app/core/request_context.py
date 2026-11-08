"""Each request's id: on its answer, on every log line it causes, and in an
error's message, so a person can quote it and its lines can be found.

There was none, so one person's failure couldn't be told from another's in
the log, and "it broke" led nowhere.
"""
import logging
import re
import secrets
import time
from contextvars import ContextVar

from app.core.errors import log_text

# The id of the request being handled; "-" outside one (start-up, scripts).
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# One line per request, written when its answer is done.
access_log = logging.getLogger("resumate.access")

# An id a proxy in front may already have given the request, kept when it's
# plain: letters, digits, dots, dashes and underscores, 8 to 64 of them.
# Anything else is replaced, so nothing odd reaches the log.
_GIVEN = re.compile(r"[A-Za-z0-9._-]{8,64}")


def new_request_id(given: str = "") -> str:
    """The id a proxy gave the request, when it's plain, or a new one."""
    return given if _GIVEN.fullmatch(given or "") else secrets.token_hex(6)


def install_log_records() -> None:
    """Every log record gets the current request's id, as `request_id`, and
    keeps no exception's text.

    A record made with an exception (logger.exception, exc_info=, and
    uvicorn's "Exception in ASGI application", which every unexpected error
    reaches) printed a traceback, which ends with the exception's own text,
    and that could hold a person's data. Its message gets the exception's
    type and where it happened instead (errors.log_text), and the traceback
    goes.

    Done as each record is made, not by a handler, so it holds whichever
    handler writes the record: the app's, uvicorn's or the tests'.
    """
    make = logging.getLogRecordFactory()
    if getattr(make, "resumate_records", False):
        return

    def resumate_record(*args, **kwargs):
        record = make(*args, **kwargs)
        record.request_id = request_id_var.get()
        if record.exc_info and record.exc_info[1] is not None:
            try:
                message = record.getMessage()
            except Exception:
                message = str(record.msg)
            record.msg = f"{message.rstrip()} ({log_text(record.exc_info[1])})"
            record.args = None
            record.exc_info = record.exc_text = None
        return record
    resumate_record.resumate_records = True
    logging.setLogRecordFactory(resumate_record)


def log_answer(scope, status: int, started: float) -> None:
    """The request's line: method, the route's pattern, status, time taken.

    The pattern, e.g. /api/candidates/{candidate_id}, never the address
    itself: uvicorn's line printed whole addresses, three of which held a
    candidate's email. A path no route matched is "-", for the same reason.
    Render asks /health every few seconds, so its good answers aren't
    written.
    """
    pattern = getattr(scope.get("route"), "path", None) or "-"
    if pattern == "/health" and status == 200:
        return
    level = logging.WARNING if status >= 500 else logging.INFO
    took = (time.monotonic() - started) * 1000
    access_log.log(level, "%s %s %s %dms", scope.get("method", "-"), pattern, status, took)


class RequestContext:
    """Gives each request its id, answers with it in X-Request-ID, and
    writes the request's line (log_answer) when it's done.

    Plain ASGI, as SecurityHeaders is. The id isn't reset when the request
    is done: each request runs in a task of its own, and the error handler,
    which runs outside every middleware, still needs it.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        given = dict(scope.get("headers") or []).get(b"x-request-id", b"").decode("latin-1")
        request_id = new_request_id(given)
        request_id_var.set(request_id)
        started = time.monotonic()
        # An error that escapes is answered outside, with a 500.
        status = 500

        async def send_with_id(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = [*message.get("headers", []), (b"x-request-id", request_id.encode())]
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            log_answer(scope, status, started)

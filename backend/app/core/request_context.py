"""Each request's id: on its answer, on every log line it causes, and in an
error's message, so a person can quote it and its lines can be found.

There was none, so one person's failure couldn't be told from another's in
the log, and "it broke" led nowhere.
"""
import logging
import re
import secrets
from contextvars import ContextVar

# The id of the request being handled; "-" outside one (start-up, scripts).
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# An id a proxy in front may already have given the request, kept when it's
# plain: letters, digits, dots, dashes and underscores, 8 to 64 of them.
# Anything else is replaced, so nothing odd reaches the log.
_GIVEN = re.compile(r"[A-Za-z0-9._-]{8,64}")


def new_request_id(given: str = "") -> str:
    """The id a proxy gave the request, when it's plain, or a new one."""
    return given if _GIVEN.fullmatch(given or "") else secrets.token_hex(6)


def install_request_ids() -> None:
    """Give every log record the current request's id, as `request_id`.

    Set when a record is made, not by a handler, so it's there whichever
    handler writes the record: the app's, uvicorn's or the tests'.
    """
    make = logging.getLogRecordFactory()
    if getattr(make, "adds_request_id", False):
        return

    def record_with_request_id(*args, **kwargs):
        record = make(*args, **kwargs)
        record.request_id = request_id_var.get()
        return record
    record_with_request_id.adds_request_id = True
    logging.setLogRecordFactory(record_with_request_id)


class RequestContext:
    """Gives each request its id, and answers with it in X-Request-ID.

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

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                headers = [*message.get("headers", []), (b"x-request-id", request_id.encode())]
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_id)

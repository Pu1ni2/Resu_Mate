"""What to tell a person when something failed: plain words, never the
exception's own text.

That text was shown as it was: a library's message, an outside service's raw
reply, or a stack's details, which could hold someone's data and read as
gibberish anyway. The server's log keeps the details.
"""

BUSY = "The service it depends on is busy. Try again in a minute."
SLOW = "It took too long. Try again."
UNREACHABLE = "A service it depends on couldn't be reached. Try again in a moment."
AGAIN = "Try again in a moment."

# By name, so this needs none of the libraries: OpenAI's, httpx's, requests'.
_SLOW = {"APITimeoutError", "ReadTimeout", "ConnectTimeout", "WriteTimeout", "PoolTimeout", "TimeoutException", "Timeout"}
_UNREACHABLE = {"APIConnectionError", "ConnectError", "RemoteProtocolError", "NetworkError"}


def _status(exc: BaseException):
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(getattr(exc, "response", None), "status_code", None)
    return status


def friendly_error(exc: BaseException, failed: str) -> str:
    """`failed`, what didn't happen, then why, when that is a busy, slow or
    unreachable service, or else to try again."""
    name = type(exc).__name__
    if name == "RateLimitError" or _status(exc) == 429:
        reason = BUSY
    # Before unreachable: OpenAI's timeout is a kind of connection error.
    elif isinstance(exc, TimeoutError) or name in _SLOW:
        reason = SLOW
    elif isinstance(exc, ConnectionError) or name in _UNREACHABLE:
        reason = UNREACHABLE
    else:
        reason = AGAIN
    return f"{failed} {reason}"


def friendly_status(status: int, failed: str) -> str:
    """The same, for an outside service that answered with an error status."""
    return f"{failed} {BUSY if status == 429 else AGAIN}"

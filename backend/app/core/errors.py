"""What to tell a person when something failed: plain words, never the
exception's own text.

That text was shown as it was: a library's message, an outside service's raw
reply, or a stack's details, which could hold someone's data and read as
gibberish anyway. The server's log keeps where it happened (log_text), and
not the text either.
"""
import os
import traceback

BUSY ="The service it depends on is busy. Try again in a minute."
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


def friendly_error(exc: BaseException, failed: str, again: str = AGAIN) -> str:
    """`failed`, what didn't happen, then why, when that is a busy, slow or
    unreachable service, or else `again`: to try again, or nothing for a step
    that is tried again by itself."""
    name = type(exc).__name__
    if name == "RateLimitError" or _status(exc) == 429:
        reason = BUSY
    # Before unreachable: OpenAI's timeout is a kind of connection error.
    elif isinstance(exc, TimeoutError) or name in _SLOW:
        reason = SLOW
    elif isinstance(exc, ConnectionError) or name in _UNREACHABLE:
        reason = UNREACHABLE
    else:
        reason = again
    return f"{failed} {reason}".strip()


def friendly_status(status: int, failed: str) -> str:
    """The same, for an outside service that answered with an error status."""
    return f"{failed} {BUSY if status == 429 else AGAIN}"


# The backend's own folder: frames in it are named from here, the libraries'
# by their file alone.
_OWN = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def log_text(exc) -> str:
    """What the server's log keeps of an exception: its type, and where it
    was raised, deepest first: the backend's own lines it passed through,
    and the library's line it came from.

    Never its message, nor a traceback, which ends with the message. Either
    could hold a person's data: an address, a name, a résumé's text, the
    name of the file someone uploaded.
    """
    if exc is None:
        return "no exception"
    frames = traceback.extract_tb(exc.__traceback__)
    own = [f for f in frames if os.path.abspath(f.filename).startswith(_OWN + os.sep)
           and "site-packages" not in f.filename]
    shown = own[-3:]
    if frames and frames[-1] not in shown:
        shown.append(frames[-1])

    def place(frame):
        path = os.path.abspath(frame.filename)
        named = os.path.relpath(path, _OWN) if frame in own else os.path.basename(path)
        return f"{named.replace(os.sep, '/')}:{frame.lineno} in {frame.name}"
    where = " < ".join(place(f) for f in reversed(shown))
    return f"{type(exc).__name__} at {where}" if where else type(exc).__name__

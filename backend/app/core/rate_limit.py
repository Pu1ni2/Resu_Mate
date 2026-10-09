"""One rate limiter for the whole app, keyed by who is asking.

Each router used to make its own Limiter keyed on get_remote_address, the
address of the connection. Behind Render's proxy that is the proxy's address,
so every visitor shared one limit: one busy person could lock everyone else
out, and nobody could be limited on their own. Separate limiters also kept
separate counts.

A signed-in request is keyed by the account in its token, which a client can't
fake. Anything else (no token, or a bad or expired one) is keyed by the
visitor's address: the last X-Forwarded-For entry, the one Render's proxy
adds. Earlier entries come from the client and can say anything.
"""
from fastapi import HTTPException, Request
from slowapi import Limiter

from app.services.auth import decode_token


def client_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    last = forwarded.split(",")[-1].strip()
    if last:
        return last
    return request.client.host if request.client else "unknown"


def rate_limit_key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth[:7].lower() == "bearer ":
        try:
            payload = decode_token(auth[7:].strip())
        except HTTPException:
            payload = {}
        subject = str(payload.get("sub") or "").strip()
        if subject and payload.get("type") == "candidate":
            return f"candidate:{subject.lower()}"
        if subject and payload.get("type") == "access":
            return f"manager:{subject}"
    return f"address:{client_address(request)}"


limiter = Limiter(key_func=rate_limit_key)

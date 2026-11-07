"""Headers every answer from the API carries, so browsers handle it safely.

The API sent none:
- X-Content-Type-Options: nosniff. A browser could guess a file's type from
  its contents, and run as a page what was sent as something else.
- X-Frame-Options: DENY. Another site could show the API's answers inside a
  frame of its own.
- Referrer-Policy: no-referrer. A link followed from an answer would tell the
  next site the address it came from.
- Strict-Transport-Security, in production. Once a browser has seen it, the
  browser uses HTTPS for the API, never plain HTTP. Local runs are plain HTTP,
  so they don't send it.

Plain ASGI rather than BaseHTTPMiddleware, which wraps each response in
another and can hold up a streamed one, as Find Candidates' is.
"""

_ALWAYS = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
)
_HSTS = (b"strict-transport-security", b"max-age=31536000; includeSubDomains")


class SecurityHeaders:
    def __init__(self, app, hsts: bool = False):
        self.app = app
        self.headers = _ALWAYS + ((_HSTS,) if hsts else ())

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                headers += [(name, value) for name, value in self.headers if name not in present]
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)

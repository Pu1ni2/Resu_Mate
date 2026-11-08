"""One library makes and reads sign-in tokens: PyJWT.

python-jose did the same job beside it, two libraries to keep patched for
one task; and passlib, which nothing used, was what installed bcrypt,
which the code uses itself.
"""
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _required():
    with open(os.path.join(BACKEND, "requirements.in"), encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    return {re.split(r"[\[<>=!~ ]", line, maxsplit=1)[0].lower() for line in lines}


def test_the_server_installs_one_token_library_and_bcrypt_itself():
    required = _required()
    assert {"pyjwt", "bcrypt"} <= required
    assert not {"python-jose", "passlib"} & required


def test_no_code_imports_the_others():
    found = []
    pattern = re.compile(r"^\s*(from|import)\s+(jose|passlib)\b")
    for folder, _, names in os.walk(os.path.join(BACKEND, "app")):
        for name in names:
            if name.endswith(".py"):
                path = os.path.join(folder, name)
                with open(path, encoding="utf-8") as f:
                    found += [f"{os.path.relpath(path, BACKEND)}:{n}" for n, line in enumerate(f, 1) if pattern.match(line)]
    assert found == []


def test_a_token_made_and_read_round_trips():
    from app.services.auth import create_access_token, decode_token
    payload = decode_token(create_access_token({"sub": "7"}))
    assert (payload["sub"], payload["type"]) == ("7", "access")

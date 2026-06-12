"""Auth + OTP hardening regression tests."""
from conftest import register, auth_headers


def test_register_and_login(client):
    tok, user = register(client, "login@co.com", password="pw12345678")
    assert tok
    r = client.post("/api/auth/login", json={"email": "login@co.com", "password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


def test_login_wrong_password_rejected(client):
    register(client, "wp@co.com", password="pw12345678")
    r = client.post("/api/auth/login", json={"email": "wp@co.com", "password": "wrongpass1"})
    assert r.status_code == 401


def test_duplicate_email_rejected(client):
    register(client, "dup@co.com")
    r = client.post("/api/auth/register", json={
        "name": "X", "email": "dup@co.com", "password": "pw12345678",
    })
    assert r.status_code == 400


def test_short_password_rejected(client):
    r = client.post("/api/auth/register", json={
        "name": "X", "email": "short@co.com", "password": "abc",
    })
    assert r.status_code == 400


def test_me_requires_auth(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401

    tok, _ = register(client, "me@co.com")
    r2 = client.get("/api/auth/me", headers=auth_headers(tok))
    assert r2.status_code == 200
    assert r2.json()["email"] == "me@co.com"


def test_otp_is_hashed_not_plaintext(client):
    """The stored OTP must be a bcrypt hash, never the 6-digit code."""
    import asyncio
    from app.core import database
    from app.models.candidate import CandidateAccess
    from app.models.auth import OTPCode
    from sqlalchemy import select

    # Grant access so send-otp doesn't 404, then request an OTP.
    async def grant():
        async with database.async_session() as db:
            db.add(CandidateAccess(email="cand@x.com", name="Cand", manager_id=None))
            await db.commit()
    asyncio.get_event_loop().run_until_complete(grant())

    r = client.post("/api/auth/candidate/send-otp", json={"email": "cand@x.com"})
    assert r.status_code == 200, r.text

    async def fetch_otp():
        async with database.async_session() as db:
            row = (await db.execute(
                select(OTPCode).where(OTPCode.email == "cand@x.com")
            )).scalars().first()
            return row
    otp = asyncio.get_event_loop().run_until_complete(fetch_otp())
    assert otp is not None
    # A 6-digit plaintext code would be length 6; a bcrypt hash is ~60 chars.
    assert len(otp.code) > 20
    assert not otp.code.isdigit()

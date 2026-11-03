"""The product is called ResuMate wherever it speaks.

Emails and the chat said "ResuMate AI", the PDF "ResuMate Pro", and Jarvis's
instructions still spoke of "eye contact", which the face tracking never
measured.
"""
import pytest

from app.services.email_service import email_service
from app.services.resume_rag import resume_rag


@pytest.mark.asyncio
async def test_the_access_code_email_names_resumate(monkeypatch):
    sent = {}

    async def send(to_email, subject, html):
        sent.update(to=to_email, subject=subject, html=html)
        return True
    monkeypatch.setattr(email_service, "send", send)
    await email_service.send_otp("ada@x.com", "123456")
    assert "ResuMate AI" not in sent["html"] and "ResuMate AI" not in sent["subject"]
    assert "Your ResuMate access code" in sent["html"]


@pytest.mark.parametrize("count", [0, 3])
def test_the_chat_welcome_names_resumate(count):
    welcome = resume_rag.get_intro_message(count)["response"]
    assert "Welcome to ResuMate!" in welcome
    assert "ResuMate AI" not in welcome


def test_jarvis_is_told_of_face_in_view_not_eye_contact():
    import inspect
    from app.api import jarvis
    source = inspect.getsource(jarvis)
    assert "eye contact" not in source.lower()
    assert "face in view" in source

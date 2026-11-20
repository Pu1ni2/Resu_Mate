"""The product is called ResuMate wherever it speaks.

Emails and the chat said "ResuMate AI", the PDF "ResuMate Pro", and Jarvis's
instructions still spoke of "eye contact", which the face tracking never
measured.
"""
import pytest

from app.services.email_service import sign_in_code_email
from app.services.resume_rag import resume_rag


def test_the_access_code_email_names_resumate():
    subject, html = sign_in_code_email("123456")
    assert "ResuMate AI" not in html and "ResuMate AI" not in subject
    assert "Your ResuMate access code" in html


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

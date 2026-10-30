"""Jarvis's instructions. An interview it asks for waits for the manager to
confirm it on screen, and it sends no email itself, so it must not say that
either is done: it used to answer "Setting that up." above the card asking."""
from app.api.jarvis import JARVIS_SYSTEM_PROMPT


def test_jarvis_is_told_interviews_wait_for_the_manager():
    assert "batch_action and create_interview wait for the manager to confirm them on screen" in JARVIS_SYSTEM_PROMPT


def test_jarvis_is_told_it_sends_no_email_and_says_nothing_is_done():
    assert "no email is sent from here" in JARVIS_SYSTEM_PROMPT
    assert "never say an interview is created or an email is sent" in JARVIS_SYSTEM_PROMPT

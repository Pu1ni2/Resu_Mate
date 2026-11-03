"""Drafts are signed by the manager, and invitations name the company.

AI drafts were signed "[Your Name]" for the manager to find and replace, and
an interview invitation said only "you have been invited", by no one in
particular.
"""
import pytest

from conftest import auth_headers

from app.agents.hr_agent import fill_placeholders, hr_agent
from app.services.email_service import email_service
from app.services.resume_rag import resume_rag
from app.tools.openai_tool import openai_tool

MANAGER = {"name": "Morgan Lee", "company": "Fieldwork"}
REPLY = "SUBJECT: A conversation, [Company]?\nBODY:\nHi Ada,\n\nWould you talk with us?\n\nBest,\n[Your Name]\n[Your Title]\n[Company Name]"


def test_placeholders_are_filled_from_the_manager():
    assert fill_placeholders("Best,\n[Your Name]\n[Company Name]", MANAGER) == "Best,\nMorgan Lee\nFieldwork"
    assert fill_placeholders("[your full name] at [Your Company]", MANAGER) == "Morgan Lee at Fieldwork"


def test_what_cant_be_filled_is_left_out():
    assert fill_placeholders("Best,\n[Your Name]\n[Your Title]", None) == "Best,"
    assert fill_placeholders("Thanks, [Recruiter]", {}) == "Thanks,"


def _model_replies(monkeypatch):
    prompts = []

    async def structured_call(prompt, system="", json_mode=False):
        prompts.append(prompt)
        return REPLY
    monkeypatch.setattr(openai_tool, "structured_call", structured_call)
    return prompts


@pytest.mark.asyncio
async def test_a_draft_is_signed_by_the_manager_sending_it(monkeypatch):
    prompts = _model_replies(monkeypatch)
    draft = await hr_agent.draft_email({"name": "Ada Lovelace", "skills": []}, "interest", sender=MANAGER)
    assert "sign off as Morgan Lee, Fieldwork" in prompts[0]
    assert "[Your Name]" not in prompts[0]
    assert draft["subject"] == "A conversation, Fieldwork?"
    assert draft["body"].endswith("Best,\nMorgan Lee\nFieldwork")
    assert "[" not in draft["body"]


def test_the_draft_route_signs_with_the_signed_in_manager(client, monkeypatch):
    _model_replies(monkeypatch)
    r = client.post("/api/auth/register", json={
        "name": "Morgan Lee", "email": "morgan@x.com", "password": "pw12345678", "company": "Fieldwork",
        "accept_terms": True,
    })
    assert r.status_code in (200, 201), r.text
    token, user = r.json()["access_token"], r.json()["user"]
    resume_rag.candidates.setdefault(user["id"], {})[1] = {"id": 1, "name": "Ada Lovelace", "skills": [], "is_resume": True}
    r = client.post("/api/chat/draft-email", headers=auth_headers(token), json={"candidate_id": 1, "email_type": "interest"})
    assert r.status_code == 200, r.text
    assert r.json()["body"].endswith("Best,\nMorgan Lee\nFieldwork")


@pytest.mark.asyncio
async def test_an_invitation_names_the_company_inviting(monkeypatch):
    sent = []

    async def send(to_email, subject, html):
        sent.append((subject, html))
        return True
    monkeypatch.setattr(email_service, "send", send)
    await email_service.send_interview_invitation("ada@x.com", "Ada", "Designer", "https://x/login", company="Fieldwork")
    await email_service.send_interview_invitation("ada@x.com", "Ada", "Designer", "https://x/login")
    (with_company, html), (without, plain) = sent
    assert with_company == "Interview invitation from Fieldwork: Designer"
    assert "Fieldwork has invited you" in html
    assert without == "Interview Invitation: Designer"
    assert "You have been invited" in plain

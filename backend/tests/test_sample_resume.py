"""The sample résumé shipped with the app is a made-up person's.

It used to be a real résumé, phone number included, served to anyone at
/sample-resume.pdf. backend/scripts/make_sample_resume.py writes this one.
"""
from pathlib import Path

from app.services.resume_rag import primary_email
from app.tools.pdf_tool import pdf_tool

SAMPLE = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sample-resume.pdf"


def _text():
    return pdf_tool._extract_text(str(SAMPLE), SAMPLE.name)


def test_the_sample_reads_back_as_a_resume():
    text = _text()
    assert text.startswith("Riley Samplewood")
    for section in ("SUMMARY", "SKILLS", "EXPERIENCE", "EDUCATION"):
        assert section in text


def test_its_contact_details_are_kept_for_fiction():
    text = _text()
    assert primary_email({"text": text}) == "riley.samplewood@example.com"
    contact = pdf_tool.extract_contact_from_text(text)
    assert "555-01" in contact["phone"]
    # Nothing a profile lookup would follow to a real person.
    assert (contact["github_username"], contact["linkedin_username"]) == (None, None)
    assert pdf_tool._extract_links(str(SAMPLE), SAMPLE.name)["all_urls"] == []


def test_it_says_it_is_made_up():
    assert "made up" in _text()

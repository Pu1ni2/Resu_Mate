"""One report for both kinds of interview: from the whole transcript, and
none on too little.

Both endings read only the first 8,000 characters of the transcript, and
asked the AI for a verdict however little was captured: a few stray words,
with none of the questions, got "Pass".
"""
import asyncio

import pytest

from conftest import register

from app.services import interview_report
from app.services.auth import create_candidate_token

# What a voice interview kept when the interviewer's lines were lost.
STRAY = [{"role": "candidate", "text": t} for t in ("Hello", "Oops", "upstairs", "Hey", "Are you speaking?")]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def ai(monkeypatch):
    """The AI writes "## Report"; what it was asked is kept."""
    from app.tools.openai_tool import openai_tool
    asked = []

    async def write(prompt, system="", json_mode=False):
        asked.append(prompt)
        return "## Report"
    monkeypatch.setattr(openai_tool, "structured_call", write)
    return asked


def test_a_few_stray_words_get_no_verdict(ai):
    assert _run(interview_report.write_report(STRAY, "AI Specialist")) == interview_report.NOT_ENOUGH
    assert ai == []  # nothing for the AI to judge


def test_answers_without_the_questions_get_no_verdict(ai):
    answers = [{"role": "candidate", "text": "I built data pipelines for years " * 20}]
    assert _run(interview_report.write_report(answers, "Dev")) == interview_report.NOT_ENOUGH
    assert ai == []


def test_the_whole_transcript_is_read(ai):
    transcript = [{"role": "interviewer", "text": "Tell me about your work."}]
    transcript += [{"role": "candidate", "text": f"Answer {i}: " + "detail " * 60} for i in range(40)]
    transcript.append({"role": "candidate", "text": "The last thing I said."})
    assert _run(interview_report.write_report(transcript, "Dev")) == "## Report"
    assert len(ai) == 1
    assert "The last thing I said." in ai[0]  # long past the first 8,000 characters
    assert "recorded" not in ai[0].lower()


def test_a_voice_interview_with_too_little_is_reported_as_such(client, ai):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    from app.services.db_service import report_dict
    _, m = register(client, "w1@co.com")

    async def make():
        async with database.async_session() as db:
            cand = Candidate(manager_id=m["id"], name="Cand", email="w1@x.com")
            db.add(cand)
            await db.flush()
            iv = Interview(candidate_id=cand.id, manager_id=m["id"], candidate_email="w1@x.com", role="Dev",
                           status="in_progress", mode="conversational")
            db.add(iv)
            await db.commit()
            return iv.id

    async def read(iid):
        async with database.async_session() as db:
            iv = await db.get(Interview, iid)
            return iv.status, report_dict(iv.report)

    iid = _run(make())
    r = client.post("/api/realtime/finalize", headers={"Authorization": f"Bearer {create_candidate_token('w1@x.com')}"},
                    json={"interview_id": iid, "transcript": STRAY, "duration": 74})
    assert r.status_code == 200, r.text
    status, report = _run(read(iid))
    assert status == "completed"
    assert report["report"] == interview_report.NOT_ENOUGH
    assert "Pass" not in report["report"]

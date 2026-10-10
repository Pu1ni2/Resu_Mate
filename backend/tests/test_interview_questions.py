"""An interview asks the questions made for its candidate and role.

create-interview analysed the résumé and threw the result away, so the voice
interview, which reads interview.questions and room_config, asked every
candidate the same five generic questions. The avatar room took its role,
question count, focus areas and résumé checks from the request, so the
candidate could set their own.
"""
import asyncio
import importlib

import pytest

from conftest import auth_headers, register

from app.services.auth import create_candidate_token

TARGETS = [{"skill": "Kafka", "claim": "Built event pipelines", "question_angle": "Ask about partitioning"}]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def generator(monkeypatch):
    """The question generator, answering with `reply` (or raising it)."""
    from app.agents.technical_agent import technical_agent
    state = {"reply": {"questions": ["1. Walk me through your Kafka work.", "2) How do you size partitions?", "",
                                     "- Tell me about a hard bug."],
                       "resume_intelligence": {"verification_targets": TARGETS}}}

    async def generate_smart_questions(*args, **kwargs):
        if isinstance(state["reply"], Exception):
            raise state["reply"]
        return state["reply"]
    monkeypatch.setattr(technical_agent, "generate_smart_questions", generate_smart_questions)
    return state


def _own_candidate(client, tok, email):
    from app.core import database
    from app.services import db_service
    from app.services.resume_rag import resume_rag
    manager_id = client.get("/api/auth/me", headers=auth_headers(tok)).json()["id"]

    async def seed():
        async with database.async_session() as db:
            return (await db_service.create_candidate_db(db, {"name": "Ada", "email": email}, manager_id=manager_id)).id
    cid = _run(seed())
    resume_rag.candidates.setdefault(manager_id, {})[cid] = {"id": cid, "manager_id": manager_id, "name": "Ada",
                                                             "email": email, "text": f"Ada\n{email}", "is_resume": True}
    return cid


def _create(client, tok, email, **extra):
    cid = _own_candidate(client, tok, email)
    r = client.post("/api/chat/create-interview", headers=auth_headers(tok), json={
        "candidate_id": cid, "candidate_email": email, "candidate_name": "Ada", "role": "Data Engineer",
        "num_questions": 3, "focus_areas": ["Kafka"], **extra,
    })
    assert r.status_code == 200, r.text
    return r.json()


def _interview(email):
    from sqlalchemy import select
    from app.core import database
    from app.models.candidate import Interview

    async def read():
        async with database.async_session() as db:
            return (await db.execute(select(Interview).where(Interview.candidate_email == email))).scalar_one()
    return _run(read())


# ── creating the interview ────────────────────────────────────────────────────

def test_the_questions_and_resume_checks_are_kept(client, generator):
    tok, _ = register(client, "q1@co.com")
    _create(client, tok, "q1@x.com")
    iv = _interview("q1@x.com")
    # Cleaned of numbering and blanks, and as many as were asked for.
    assert iv.questions == ["Walk me through your Kafka work.", "How do you size partitions?", "Tell me about a hard bug."]
    assert iv.room_config["resume_intelligence"]["verification_targets"] == TARGETS


def test_a_failed_analysis_is_not_kept(client, generator):
    generator["reply"] = {"questions": [], "resume_intelligence": {"analysis_failed": True, "verification_targets": []}}
    tok, _ = register(client, "q2@co.com")
    _create(client, tok, "q2@x.com")
    iv = _interview("q2@x.com")
    assert not iv.questions
    assert not (iv.room_config or {}).get("resume_intelligence")


def test_the_interview_stands_when_the_questions_cannot_be_made(client, generator):
    generator["reply"] = RuntimeError("model unavailable")
    tok, _ = register(client, "q3@co.com")
    assert _create(client, tok, "q3@x.com")["interview_config"]["role"] == "Data Engineer"
    assert _interview("q3@x.com").status == "pending"


# ── the voice interview ───────────────────────────────────────────────────────

def test_the_voice_interview_asks_the_saved_questions(client, generator):
    from app.api.realtime import _build_instructions
    tok, _ = register(client, "q4@co.com")
    _create(client, tok, "q4@x.com")
    instructions = _build_instructions(_interview("q4@x.com"), "Ada", 8)
    assert "How do you size partitions?" in instructions
    assert "Ask about partitioning" in instructions
    assert "Walk me through your background" not in instructions  # the generic fallback


# ── the avatar room ───────────────────────────────────────────────────────────

@pytest.fixture()
def livekit(monkeypatch):
    from app.api import livekit_routes
    from app.core.config import settings
    monkeypatch.setattr(settings, "avatar_interviews", True)
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        monkeypatch.setenv(key, "set")
        monkeypatch.setattr(livekit_routes, key, f"test-{key.lower()}-long-enough-for-hs256")


def test_the_room_is_set_up_from_the_saved_interview_not_the_request(client, generator, livekit):
    tok, _ = register(client, "q5@co.com")
    _create(client, tok, "q5@x.com", mode="avatar")
    r = client.post("/api/livekit/create-room", headers={"Authorization": f"Bearer {create_candidate_token('q5@x.com')}"},
                    json={"candidate_email": "q5@x.com", "consent": True, "interview_config": {
                        "role": "Intern", "num_questions": 1, "focus_areas": ["anything easy"],
                        "resume_intelligence": {"verification_targets": []},
                    }})
    assert r.status_code == 200, r.text
    config = _interview("q5@x.com").room_config
    assert (config["role"], config["num_questions"], config["focus_areas"]) == ("Data Engineer", 3, ["Kafka"])
    assert config["verification_targets"] == TARGETS
    assert config["questions"][1] == "How do you size partitions?"


# ── the avatar worker ─────────────────────────────────────────────────────────

def test_the_worker_asks_the_saved_questions(monkeypatch):
    import dotenv
    # The worker loads a local .env over the environment when imported.
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    worker = importlib.import_module("interview_agent")
    prompt = worker.build_system_prompt({"role": "Data Engineer", "num_questions": 8, "candidate_name": "Ada",
                                         "questions": ["How do you size partitions?", "Tell me about a hard bug."]})
    assert "Ask exactly 2 questions" in prompt
    assert "1. How do you size partitions?" in prompt and "2. Tell me about a hard bug." in prompt
    assert "QUESTIONS" not in worker.build_system_prompt({"role": "Data Engineer", "num_questions": 5})

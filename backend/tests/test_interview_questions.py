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


def test_a_batch_interview_gets_the_candidates_own_questions(client, generator):
    # The batch invite saved none: five generic questions, whatever number was chosen.
    tok, _ = register(client, "q8@co.com")
    cid = _own_candidate(client, tok, "q8@x.com")
    r = client.post("/api/pipeline/batch-action", headers=auth_headers(tok), json={
        "candidate_ids": [cid], "role": "Data Engineer", "num_questions": 2, "focus_areas": ["Kafka"],
    })
    assert r.status_code == 200, r.text
    assert r.json()["interviews_created"] == 1
    iv = _interview("q8@x.com")
    assert iv.questions == ["Walk me through your Kafka work.", "How do you size partitions?"]
    assert iv.room_config["resume_intelligence"]["verification_targets"] == TARGETS


def test_the_interview_stands_when_the_questions_cannot_be_made(client, generator):
    generator["reply"] = RuntimeError("model unavailable")
    tok, _ = register(client, "q3@co.com")
    assert _create(client, tok, "q3@x.com")["interview_config"]["role"] == "Data Engineer"
    assert _interview("q3@x.com").status == "pending"


# ── the voice interview ───────────────────────────────────────────────────────

def test_the_voice_interview_asks_the_saved_questions(client, generator):
    from app.services.interview_script import build_instructions
    tok, _ = register(client, "q4@co.com")
    _create(client, tok, "q4@x.com")
    instructions = build_instructions(_interview("q4@x.com"), "Ada", 8)
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


def test_the_room_carries_the_voice_interviews_script(client, generator, livekit):
    # The worker's own script had none of the voice script's rules: every
    # question in order, no stalling, a proper close.
    from app.services.interview_script import load_prompt
    tok, _ = register(client, "q6@co.com")
    _create(client, tok, "q6@x.com", mode="avatar")
    r = client.post("/api/livekit/create-room", headers={"Authorization": f"Bearer {create_candidate_token('q6@x.com')}"},
                    json={"candidate_email": "q6@x.com", "consent": True})
    assert r.status_code == 200, r.text
    instructions = _interview("q6@x.com").room_config["instructions"]
    assert instructions.startswith(load_prompt())
    assert "How do you size partitions?" in instructions
    assert "Ask about partitioning" in instructions  # the résumé check saved with the interview


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


def test_the_worker_does_not_pass_as_human(monkeypatch):
    # Candidates are told an AI interviewer asks the questions.
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    worker = importlib.import_module("interview_agent")
    prompt = worker.build_system_prompt({"role": "Data Engineer", "num_questions": 5, "candidate_name": "Ada"})
    assert "Stay in character as Alex." in prompt
    assert "human" not in prompt.lower()


def test_the_worker_interviews_by_the_servers_script(monkeypatch):
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    worker = importlib.import_module("interview_agent")
    room = {"role": "Data Engineer", "num_questions": 5, "candidate_name": "Ada"}
    assert worker.instructions_for({**room, "instructions": "The voice interview's script."}) == "The voice interview's script."
    # A room made before the server sent one.
    assert worker.instructions_for(room) == worker.build_system_prompt(room)
    assert worker.instructions_for({**room, "instructions": "  "}) == worker.build_system_prompt(room)


class _Session:
    """The agent session, as far as opening the interview uses it."""

    def __init__(self, refuse=False):
        self.asked, self.refuse = [], refuse

    def generate_reply(self, **kwargs):
        if self.refuse:
            raise RuntimeError("not ready")
        self.asked.append(kwargs)


def test_the_worker_opens_the_interview(monkeypatch):
    # The realtime model answers only when asked: the candidate sat in silence.
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    worker = importlib.import_module("interview_agent")
    session = _Session()
    worker.open_interview(session)
    assert len(session.asked) == 1
    opening = session.asked[0]["instructions"].lower()
    assert "greet the candidate" in opening and "first question" in opening
    # A refused request leaves the interview running.
    worker.open_interview(_Session(refuse=True))


def test_the_worker_sends_the_interviews_length(monkeypatch):
    # It was always 0.
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    worker = importlib.import_module("interview_agent")
    sent = []

    class _Reply:
        ok = True

    def post(url, json=None, headers=None, timeout=None):
        sent.append(json)
        return _Reply()
    monkeypatch.setattr(worker.requests, "post", post)
    worker.post_transcript({"candidate_email": "ada@x.com"}, [{"role": "candidate", "text": "Hello"}],
                           room_name="interview-a", duration=143.7)
    assert len(sent) == 1
    assert (sent[0]["duration"], sent[0]["room_name"]) == (143, "interview-a")


def test_the_worker_sets_the_model_as_the_voice_session_does(client, generator, monkeypatch):
    # LiveKit's own turn-taking, at medium eagerness, cut Alex off; the voice
    # interview's session is set for a calmer conversation.
    import json
    import dotenv
    import httpx
    from app.core.config import settings
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "realtime_model", "gpt-realtime-2")
    sent = []

    def handler(request):
        sent.append(json.loads(request.content)["session"])
        return httpx.Response(200, json={"value": "ek_test", "expires_at": 1})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))

    tok, _ = register(client, "q7@co.com")
    _create(client, tok, "q7@x.com")
    r = client.post("/api/realtime/session", headers={"Authorization": f"Bearer {create_candidate_token('q7@x.com')}"},
                    json={"interview_id": _interview("q7@x.com").id, "candidate_email": "q7@x.com", "consent": True})
    assert r.status_code == 200, r.text
    voice = sent[0]
    worker = importlib.import_module("interview_agent").REALTIME_SETTINGS
    assert worker["turn_detection"].model_dump(exclude_none=True) == voice["audio"]["input"]["turn_detection"]
    assert worker["input_audio_transcription"].model_dump(exclude_none=True) == voice["audio"]["input"]["transcription"]
    assert worker["reasoning"].model_dump(exclude_none=True) == voice["reasoning"]


def test_the_room_carries_the_interviews_time_limit(client, generator, livekit, monkeypatch):
    # Video had none, and is billed by the minute.
    from app.core.config import settings
    monkeypatch.setattr(settings, "realtime_max_total_minutes", 12)
    tok, _ = register(client, "q9@co.com")
    _create(client, tok, "q9@x.com", mode="avatar")
    r = client.post("/api/livekit/create-room", headers={"Authorization": f"Bearer {create_candidate_token('q9@x.com')}"},
                    json={"candidate_email": "q9@x.com", "consent": True})
    assert r.status_code == 200, r.text
    config = _interview("q9@x.com").room_config
    assert config["max_minutes"] == 12
    assert '"remaining_minutes": 12' in config["instructions"]


def test_the_worker_ends_the_interview_at_its_time_limit(monkeypatch):
    # Video ran until the candidate left, and is billed by the minute.
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    worker = importlib.import_module("interview_agent")
    slept, closed = [], []

    async def sleep(seconds):
        slept.append(seconds)

    class _Ctx:
        async def delete_room(self):
            closed.append("room")

        def shutdown(self, reason=""):
            closed.append(reason)

    session = _Session()
    _run(worker.keep_to_time(session, _Ctx(), worker.time_limit_seconds({"max_minutes": 8}), sleep=sleep))
    assert slept == [7 * 60, 60]  # asked to close a minute early, then the room closes
    assert "close the interview" in session.asked[0]["instructions"]
    assert closed == ["room"]
    # A room made before the server sent a limit gets its default.
    assert worker.time_limit_seconds({}) == 8 * 60


def test_the_worker_sends_the_transcript_so_far(monkeypatch):
    # It was sent only as the worker shut down.
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    worker = importlib.import_module("interview_agent")
    sent = []

    class _Reply:
        ok = True

    def post(url, json=None, headers=None, timeout=None):
        sent.append((url, json, headers))
        return _Reply()
    monkeypatch.setattr(worker.requests, "post", post)
    so_far = [{"role": "interviewer", "text": "Tell me about a project you led."}]
    worker.post_checkpoint({"candidate_email": "ada@x.com"}, so_far, "interview-a")
    url, body, headers = sent[0]
    assert url.endswith("/api/chat/transcript-checkpoint")
    assert body == {"candidate_email": "ada@x.com", "room_name": "interview-a", "transcript": so_far}
    assert headers == {"X-Agent-Token": worker.AGENT_SHARED_SECRET}
    # Nothing to send, nothing sent.
    worker.post_checkpoint({"candidate_email": "ada@x.com"}, [], "interview-a")
    assert len(sent) == 1

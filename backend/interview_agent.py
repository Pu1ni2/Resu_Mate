"""
ResuMate AI — Interview Agent (LiveKit + Simli + OpenAI Realtime)
Run: python interview_agent.py dev
"""
import asyncio
import os
import sys
import time
import logging
import requests
from dotenv import load_dotenv

load_dotenv(override=True)

logger = logging.getLogger("resumate-interview-agent")
logger.setLevel(logging.INFO)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8006")
SIMLI_API_KEY = os.getenv("SIMLI_API_KEY")
SIMLI_FACE_ID = os.getenv("SIMLI_FACE_ID", "tmp9i8bbq7c")
OPENAI_VOICE = os.getenv("OPENAI_VOICE", "alloy")
AGENT_SHARED_SECRET = os.getenv("AGENT_SHARED_SECRET", "")

# Import LiveKit at module level
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
from livekit.plugins import openai as lk_openai, simli as lk_simli
from openai.types.realtime import AudioTranscription, RealtimeReasoning
from openai.types.realtime.realtime_audio_input_turn_detection import SemanticVad

# The model's settings, as the voice interview's session sets them
# (app/api/realtime.py). LiveKit's own turn-taking, at medium eagerness, cut
# Alex off mid-word on a short noise; at low eagerness the candidate also gets
# time to think before their turn is taken as over.
REALTIME_SETTINGS = {
    "turn_detection": SemanticVad(type="semantic_vad", eagerness="low",
                                  create_response=True, interrupt_response=True),
    "reasoning": RealtimeReasoning(effort="low"),
    "input_audio_transcription": AudioTranscription(model="gpt-4o-transcribe", language="en"),
}


def get_interview_config(room_name):
    """Fetch the room's interview config from the backend.

    Authenticates with X-Agent-Token (the same shared secret used for
    /save-transcript) because this endpoint exposes the candidate's email, name,
    and resume-derived verification targets.

    Returns None when the config cannot be fetched. Callers MUST treat that as
    fatal: the previous behaviour returned a generic "Software Engineer" default,
    so a bad secret or a cold backend silently produced a wrong-role interview
    that appeared to succeed.
    """
    if not AGENT_SHARED_SECRET:
        logger.error(
            "AGENT_SHARED_SECRET not set; the backend will reject the room-config "
            "fetch with 401. Set AGENT_SHARED_SECRET on both backend and worker."
        )
        return None

    headers = {"X-Agent-Token": AGENT_SHARED_SECRET}
    last_error = None
    for url in [BACKEND_URL, "http://localhost:8006"]:
        try:
            resp = requests.get(
                f"{url}/api/livekit/interview-room-config/{room_name}",
                headers=headers,
                timeout=5,
            )
            if resp.ok:
                return resp.json()
            last_error = f"{url} returned {resp.status_code}: {resp.text[:200]}"
            # 401/403 is a config error, not a transport error — retrying the
            # next host with the same bad secret cannot help.
            if resp.status_code in (401, 403, 503):
                break
        except Exception as exc:
            last_error = f"{url}: {exc}"

    logger.error(f"Could not fetch interview config for room {room_name}: {last_error}")
    return None


def build_system_prompt(config):
    role = config.get("role", "Software Engineer")
    level = config.get("level", "Mid-Level")
    num_qs = config.get("num_questions", 5)
    focus = ", ".join(config.get("focus_areas", [])) or "general skills"
    candidate = config.get("candidate_name", "the candidate")

    # Resume intelligence — verification targets
    verification_section = ""
    targets = config.get("verification_targets", [])
    if targets:
        verification_section = "\n\nRESUME VERIFICATION TARGETS (weave 2-3 of these into your questions naturally, do NOT mention you analyzed their resume):"
        for t in targets[:4]:
            verification_section += f"\n- Probe '{t.get('skill', '')}': {t.get('question_angle', '')}"

    # The questions made for this candidate and role when the interview was
    # created, when there are some; otherwise the interviewer writes its own.
    questions = [q for q in (config.get("questions") or []) if isinstance(q, str) and q.strip()]
    questions_section = ""
    if questions:
        num_qs = len(questions)
        questions_section = "\n\nQUESTIONS (ask these, in this order, in your own words):"
        for i, q in enumerate(questions, 1):
            questions_section += f"\n{i}. {q}"

    return f"""You are Alex, a senior technical interviewer conducting a live video interview.
CONTEXT: Role: {role}, Level: {level}, Candidate: {candidate}, Questions: {num_qs}, Focus: {focus}
RULES: Keep responses SHORT. Ask ONE question at a time. Acknowledge answers briefly. Ask exactly {num_qs} questions. Start easy, increase difficulty. Cover {focus}. Stay in character as Alex.{verification_section}{questions_section}
STRUCTURE: 1. IMMEDIATELY greet: "Hi {candidate}! I'm Alex, interviewing you for {role}. Let's start easy." 2. Ask questions one at a time. 3. After all questions: "Thank you {candidate}, we'll share results shortly."
VOICE: Conversational, medium pace, friendly but professional. No emojis or markdown."""


def instructions_for(config):
    """The script Alex interviews by: the server's, which is the voice
    interview's too (app/services/interview_script.py). Rooms made before
    the server sent one get the worker's own, build_system_prompt."""
    instructions = config.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        return instructions
    return build_system_prompt(config)


# What starts the interview. The script's opening turn says how: greet the
# candidate by name, then ask the first question.
OPENING = "Begin the interview now: greet the candidate by name and ask the first question."


def open_interview(session):
    """Alex speaks first. The realtime model answers only when asked for a
    reply, so the candidate sat in silence until they said something."""
    try:
        session.generate_reply(instructions=OPENING)
    except Exception as e:
        # The interview still runs: Alex answers once the candidate speaks.
        logger.warning(f"Could not open the interview: {type(e).__name__}")


# What ends the interview as its time runs out, a minute early so it fits.
TIME_NEARLY_UP = "Time is nearly up: close the interview now, as your closing contract says, without another question."
CLOSING_WARNING_SECONDS = 60


def time_limit_seconds(config):
    """The interview's time limit, from its room config; rooms made before
    the server sent one get its default, 8 minutes."""
    try:
        minutes = int(config.get("max_minutes") or 8)
    except (TypeError, ValueError):
        minutes = 8
    return max(1, minutes) * 60


async def keep_to_time(session, ctx, limit_seconds, sleep=asyncio.sleep):
    """End the interview at its time limit: video had none, and is billed by
    the minute. A minute before, Alex is asked to close; at the limit the
    room is closed for everyone, which ends this job, and the shutdown
    callback posts the transcript as when the candidate leaves."""
    await sleep(max(0, limit_seconds - CLOSING_WARNING_SECONDS))
    try:
        session.generate_reply(instructions=TIME_NEARLY_UP)
    except Exception as e:
        logger.warning(f"Could not ask for the close: {type(e).__name__}")
    await sleep(min(limit_seconds, CLOSING_WARNING_SECONDS))
    logger.info("Time limit reached; closing the room.")
    try:
        await ctx.delete_room()
    except Exception as e:
        logger.warning(f"Could not close the room: {type(e).__name__}")
        ctx.shutdown("time limit")


# How often, in turns of the conversation, the transcript so far is sent.
CHECKPOINT_EVERY_TURNS = 4


def post_checkpoint(config: dict, transcript: list, room_name: str):
    """Send the transcript so far: it was sent only as the worker shut down,
    so a worker that stopped mid-interview took everything said with it.
    Best effort; the transcript at the end still finishes the interview."""
    candidate_email = config.get("candidate_email", "")
    if not (candidate_email and transcript and room_name and AGENT_SHARED_SECRET):
        return
    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/chat/transcript-checkpoint",
            json={"candidate_email": candidate_email, "room_name": room_name, "transcript": transcript},
            headers={"X-Agent-Token": AGENT_SHARED_SECRET},
            timeout=10,
        )
        if not resp.ok:
            logger.warning(f"Transcript checkpoint returned {resp.status_code}")
    except Exception as e:
        logger.warning(f"Transcript checkpoint failed: {type(e).__name__}")


def post_transcript(config: dict, transcript: list, room_name: str = "", duration: int = 0):
    """POST accumulated transcript to the backend interview-report endpoint.

    room_name identifies the exact interview; without it the backend has to
    guess "the latest interview for this email". duration is the interview's
    length in seconds: it was always sent as 0.
    """
    candidate_email = config.get("candidate_email", "")
    candidate_name = config.get("candidate_name", "Candidate")
    role = config.get("role", "General")

    if not candidate_email or not transcript:
        return

    payload = {
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "room_name": room_name or None,
        "role": role,
        "questions": [],
        "answers": [],
        "scores": [],
        "duration": max(0, int(duration)),
        "transcript": transcript,
    }

    if not AGENT_SHARED_SECRET:
        logger.warning(
            "AGENT_SHARED_SECRET not set; backend will reject /save-transcript "
            "with 401. Set AGENT_SHARED_SECRET on both backend and worker."
        )
    headers = {"X-Agent-Token": AGENT_SHARED_SECRET} if AGENT_SHARED_SECRET else {}

    for url in [BACKEND_URL, "http://localhost:8006"]:
        try:
            resp = requests.post(
                f"{url}/api/chat/save-transcript",
                json=payload,
                headers=headers,
                timeout=10,
            )
            if resp.ok:
                logger.info(f"Transcript saved ({len(transcript)} turns)")
                return
            logger.warning(f"Transcript POST to {url} returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Transcript POST failed to {url}: {e}")


# ═══ ENTRYPOINT — MUST be at module level for multiprocessing to pickle it ═══
async def entrypoint(ctx: JobContext):
    # Join the LiveKit room. Without this the worker accepts the job but
    # never actually connects, and the entrypoint falls through immediately.
    await ctx.connect()

    logger.info(f"Interview agent joining room: {ctx.room.name}")
    config = get_interview_config(ctx.room.name)
    if config is None:
        # Fail loudly rather than interviewing the candidate for the wrong role.
        # The candidate sees "waiting for interviewer" and can retry, which is a
        # far better outcome than a plausible-looking but bogus interview whose
        # scores then feed a hiring decision.
        logger.error(
            f"Aborting interview in room {ctx.room.name}: no config available. "
            "Check AGENT_SHARED_SECRET matches the backend and that the room exists."
        )
        return
    logger.info(f"Config: {config.get('role')} | {config.get('num_questions')} Qs")

    # Transcript accumulator — list of {role, text, timestamp}
    transcript: list = []

    session = AgentSession(
        llm=lk_openai.realtime.RealtimeModel(
            voice=OPENAI_VOICE,
            model="gpt-realtime-2",
            **REALTIME_SETTINGS,
        ),
    )

    # Hook into session events to capture conversation turns. In
    # livekit-agents >=1.x the per-turn events are named
    # "conversation_item_added" (both sides) — the older
    # "agent_speech_committed" / "user_speech_committed" names never fire,
    # which is why the transcript was always empty.
    @session.on("conversation_item_added")
    def on_item_added(ev):
        try:
            item = getattr(ev, "item", None)
            if item is None:
                return
            text = getattr(item, "text_content", None)
            if not text:
                return
            role = "interviewer" if getattr(item, "role", "") == "assistant" else "candidate"
            transcript.append({"role": role, "text": text, "timestamp": time.time()})
            if len(transcript) % CHECKPOINT_EVERY_TURNS == 0:
                # Off the event loop: the request mustn't hold up the audio.
                asyncio.get_running_loop().run_in_executor(
                    None, post_checkpoint, config, list(transcript), ctx.room.name)
        except Exception as e:
            logger.warning(f"transcript capture failed: {type(e).__name__}")

    if SIMLI_API_KEY and SIMLI_FACE_ID:
        try:
            avatar = lk_simli.AvatarSession(
                simli_config=lk_simli.SimliConfig(
                    api_key=SIMLI_API_KEY,
                    face_id=SIMLI_FACE_ID,
                ),
            )
            logger.info("Starting Simli avatar...")
            await avatar.start(session, room=ctx.room)
            logger.info("Simli avatar started")
        except Exception as e:
            logger.warning(f"Simli failed: {e}")

    await session.start(
        agent=Agent(instructions=instructions_for(config)),
        room=ctx.room,
    )
    logger.info("Interview agent running!")
    started, ended = time.time(), []

    # The conversation ends when the session closes, as the candidate leaves.
    # The worker shuts down some time after that, so it isn't the end.
    @session.on("close")
    def on_close(ev):
        ended.append(time.time())

    # POST the transcript when the worker tears down (room ends or candidate leaves).
    async def _on_shutdown():
        try:
            length = (ended[0] if ended else time.time()) - started
            post_transcript(config, transcript, room_name=ctx.room.name, duration=length)
            logger.info("Interview session ended, transcript posted.")
        except Exception as e:
            logger.warning(f"Transcript post on shutdown failed: {e}")

    ctx.add_shutdown_callback(_on_shutdown)

    open_interview(session)
    timekeeper = asyncio.create_task(keep_to_time(session, ctx, time_limit_seconds(config)))

    # An interview that ends early, as the candidate leaves, stops the clock.
    async def _stop_timekeeper():
        timekeeper.cancel()

    ctx.add_shutdown_callback(_stop_timekeeper)

    # Hold the entrypoint open until the framework shuts the worker down. Without
    # this the function returns, the job ends, and the agent leaves the room.
    await asyncio.Event().wait()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            worker_type=WorkerType.ROOM,
        )
    )

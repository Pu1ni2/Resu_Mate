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


def get_interview_config(room_name):
    try:
        for url in [BACKEND_URL, "http://localhost:8006"]:
            try:
                resp = requests.get(f"{url}/api/livekit/interview-room-config/{room_name}", timeout=5)
                if resp.ok:
                    return resp.json()
            except:
                continue
    except:
        pass
    return {"role": "Software Engineer", "level": "Mid-Level", "num_questions": 5, "focus_areas": [], "candidate_name": "Candidate"}


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

    return f"""You are Alex, a senior technical interviewer conducting a live video interview.
CONTEXT: Role: {role}, Level: {level}, Candidate: {candidate}, Questions: {num_qs}, Focus: {focus}
RULES: Keep responses SHORT. Ask ONE question at a time. Acknowledge answers briefly. Ask exactly {num_qs} questions. Start easy, increase difficulty. Cover {focus}. Stay in character as human interviewer Alex.{verification_section}
STRUCTURE: 1. IMMEDIATELY greet: "Hi {candidate}! I'm Alex, interviewing you for {role}. Let's start easy." 2. Ask questions one at a time. 3. After all questions: "Thank you {candidate}, we'll share results shortly."
VOICE: Conversational, medium pace, friendly but professional. No emojis or markdown."""


def post_transcript(config: dict, transcript: list):
    """POST accumulated transcript to the backend interview-report endpoint."""
    candidate_email = config.get("candidate_email", "")
    candidate_name = config.get("candidate_name", "Candidate")
    role = config.get("role", "General")

    if not candidate_email or not transcript:
        return

    payload = {
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "role": role,
        "questions": [],
        "answers": [],
        "scores": [],
        "duration": 0,
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
                logger.info(f"Transcript saved ({len(transcript)} turns) for {candidate_email}")
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
    logger.info(f"Config: {config.get('role')} | {config.get('num_questions')} Qs")

    # Transcript accumulator — list of {role, text, timestamp}
    transcript: list = []

    session = AgentSession(
        llm=lk_openai.realtime.RealtimeModel(
            voice=OPENAI_VOICE,
            temperature=0.7,
            model="gpt-realtime-2",
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
        except Exception as e:
            logger.warning(f"transcript capture failed: {e}")

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
        agent=Agent(instructions=build_system_prompt(config)),
        room=ctx.room,
    )
    logger.info("Interview agent running!")

    # POST the transcript when the worker tears down (room ends or candidate leaves).
    async def _on_shutdown():
        try:
            post_transcript(config, transcript)
            logger.info("Interview session ended, transcript posted.")
        except Exception as e:
            logger.warning(f"Transcript post on shutdown failed: {e}")

    ctx.add_shutdown_callback(_on_shutdown)

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

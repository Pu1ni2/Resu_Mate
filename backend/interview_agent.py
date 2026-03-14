"""
ResuMate AI — Interview Agent (LiveKit + Simli + OpenAI Realtime)

Can run as:
  1. Standalone: python interview_agent.py dev
  2. Background thread: imported and started from main.py via run_worker_in_thread()
"""
import os
import sys
import json
import logging
import asyncio
import threading
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(override=True)

logger = logging.getLogger("resumate-interview-agent")
logger.setLevel(logging.INFO)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")
SIMLI_API_KEY = os.getenv("SIMLI_API_KEY")
SIMLI_FACE_ID = os.getenv("SIMLI_FACE_ID", "tmp9i8bbq7c")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_VOICE = os.getenv("OPENAI_VOICE", "alloy")
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

LIVEKIT_AVAILABLE = False
try:
    from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
    from livekit.plugins import openai as lk_openai, simli as lk_simli
    LIVEKIT_AVAILABLE = True
except ImportError:
    logger.warning("livekit-agents not installed - interview agent disabled")


def get_interview_config(room_name):
    try:
        url = BACKEND_URL if BACKEND_URL.startswith("http") else f"http://localhost:{os.getenv('PORT', 8001)}"
        resp = requests.get(f"{url}/api/livekit/interview-room-config/{room_name}", timeout=5)
        if resp.ok:
            return resp.json()
    except:
        pass
    return {"role": "Software Engineer", "level": "Mid-Level", "num_questions": 5, "focus_areas": [], "candidate_name": "Candidate"}


def build_system_prompt(config):
    role = config.get("role", "Software Engineer")
    level = config.get("level", "Mid-Level")
    num_qs = config.get("num_questions", 5)
    focus = ", ".join(config.get("focus_areas", [])) or "general skills"
    candidate = config.get("candidate_name", "the candidate")
    return f"""You are Alex, a senior technical interviewer conducting a live video interview.
CONTEXT: Role: {role}, Level: {level}, Candidate: {candidate}, Questions: {num_qs}, Focus: {focus}
RULES: Keep responses SHORT. Ask ONE question at a time. Acknowledge answers briefly. Ask exactly {num_qs} questions. Start easy, increase difficulty. Cover {focus}. Stay in character as human interviewer Alex.
STRUCTURE: 1. IMMEDIATELY greet: "Hi {candidate}! I'm Alex, interviewing you for {role}. Let's start easy." 2. Ask questions one at a time. 3. After all questions: "Thank you {candidate}, we'll share results shortly."
VOICE: Conversational, medium pace, friendly but professional. No emojis or markdown."""


async def entrypoint(ctx: JobContext):
    logger.info(f"Interview agent joining room: {ctx.room.name}")
    config = get_interview_config(ctx.room.name)
    session = AgentSession(llm=lk_openai.realtime.RealtimeModel(voice=OPENAI_VOICE, temperature=0.7, model="gpt-4o-realtime-preview"))
    
    if SIMLI_API_KEY and SIMLI_FACE_ID:
        try:
            avatar = lk_simli.AvatarSession(simli_config=lk_simli.SimliConfig(api_key=SIMLI_API_KEY, face_id=SIMLI_FACE_ID))
            await avatar.start(session, room=ctx.room)
            logger.info("Simli avatar started")
        except Exception as e:
            logger.warning(f"Simli failed: {e}")

    await session.start(agent=Agent(instructions=build_system_prompt(config)), room=ctx.room)
    logger.info("Interview agent running")


def run_worker_in_thread():
    """Start LiveKit agent worker in a background thread — call from main.py"""
    if not LIVEKIT_AVAILABLE:
        print("Interview agent: livekit-agents not installed, skipping")
        return
    if not LIVEKIT_URL or not LIVEKIT_API_KEY:
        print("Interview agent: LiveKit credentials not set, skipping")
        return

    def _run():
        try:
            os.environ["LIVEKIT_URL"] = LIVEKIT_URL
            os.environ["LIVEKIT_API_KEY"] = LIVEKIT_API_KEY
            os.environ["LIVEKIT_API_SECRET"] = LIVEKIT_API_SECRET
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
        except Exception as e:
            print(f"Interview agent worker failed: {e}")

    thread = threading.Thread(target=_run, daemon=True, name="interview-agent")
    thread.start()
    print("Interview agent: background worker started")


if __name__ == "__main__":
    if not LIVEKIT_AVAILABLE:
        print("Install: pip install livekit-agents livekit-plugins-openai livekit-plugins-simli")
        sys.exit(1)
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
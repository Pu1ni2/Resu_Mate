"""
ResuMate AI — Interview Agent (LiveKit + Simli + OpenAI Realtime)

This is a SEPARATE Python process that runs alongside your FastAPI backend.
It connects to LiveKit Cloud and joins rooms as the AI interviewer.

Run: python interview_agent.py dev

Requirements:
  pip install livekit-agents livekit-plugins-openai livekit-plugins-simli python-dotenv requests
"""
import os
import json
import logging
import asyncio
import requests
from datetime import datetime
from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    WorkerType,
    cli,
)
from livekit.plugins import openai, simli

load_dotenv(override=True)

logger = logging.getLogger("resumate-interview-agent")
logger.setLevel(logging.INFO)

# ═══ CONFIG ═══
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")
SIMLI_API_KEY = os.getenv("SIMLI_API_KEY")
SIMLI_FACE_ID = os.getenv("SIMLI_FACE_ID", "tmp9i8bbq7c")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_VOICE = os.getenv("OPENAI_VOICE", "alloy")  # alloy, echo, fable, onyx, nova, shimmer


def get_interview_config(room_name: str) -> dict:
    """Fetch interview config from our backend using room name"""
    try:
        # Try the livekit routes endpoint
        resp = requests.get(f"{BACKEND_URL}/api/livekit/interview-room-config/{room_name}", timeout=5)
        if resp.ok:
            return resp.json()
    except Exception as e:
        logger.warning(f"Could not fetch interview config: {e}")
    
    # Default config
    return {
        "role": "Software Engineer",
        "level": "Mid-Level",
        "num_questions": 5,
        "focus_areas": [],
        "candidate_name": "Candidate",
        "candidate_email": "",
    }


def build_system_prompt(config: dict) -> str:
    """Build the AI interviewer's system prompt from interview config"""
    role = config.get("role", "Software Engineer")
    level = config.get("level", "Mid-Level")
    num_qs = config.get("num_questions", 5)
    focus = ", ".join(config.get("focus_areas", [])) or "general skills"
    candidate = config.get("candidate_name", "the candidate")

    return f"""You are Alex, a senior technical interviewer conducting a live video interview.

INTERVIEW CONTEXT:
- Role: {role}
- Level: {level}
- Candidate: {candidate}
- Number of questions: {num_qs}
- Focus areas: {focus}

PERSONALITY:
- Professional but warm and encouraging
- Make the candidate feel comfortable while maintaining structure
- Listen carefully and ask relevant follow-up questions
- Give brief positive acknowledgments after each answer ("Great point", "Interesting", "Thank you")

INTERVIEW RULES:
- Keep responses SHORT (1-2 sentences max between questions)
- Ask ONE question at a time, wait for the answer
- After the candidate answers, briefly acknowledge, then move to next question
- Ask exactly {num_qs} questions total
- Start with an easy warm-up question, increase difficulty
- Cover the focus areas: {focus}
- If candidate seems nervous, be extra encouraging
- Never reveal scores during the interview
- Stay in character as a human interviewer named Alex

INTERVIEW STRUCTURE:
1. IMMEDIATELY greet the candidate when the session starts. Say: "Hi {candidate}! I'm Alex, and I'll be interviewing you today for the {role} position. Let's start with something easy."
2. Do NOT wait for the candidate to speak first — you start the conversation
3. Ask questions one at a time covering: {focus}
4. After each answer, give a brief 3-5 word acknowledgment
5. After all {num_qs} questions, say: "That wraps up our questions. Thank you so much for your time, {candidate}. We'll share the results with you shortly. Have a great day!"

VOICE STYLE:
- Conversational, not robotic
- Medium pace, clear pronunciation  
- Friendly but professional tone
- No emojis, no markdown, speak naturally"""


def build_first_message(config: dict) -> str:
    candidate = config.get("candidate_name", "there")
    role = config.get("role", "this position")
    return f"Hi {candidate}! Welcome to your interview. I'm Alex, and I'll be speaking with you today about the {role} role. Take a moment to get comfortable, and when you're ready, I'll start with the first question. How are you doing today?"


async def entrypoint(ctx: JobContext):
    """Main entry point — called when a candidate joins an interview room"""
    logger.info(f"🎯 Interview agent joining room: {ctx.room.name}")

    # Fetch interview config from our backend
    config = get_interview_config(ctx.room.name)
    logger.info(f"📋 Interview config: {config.get('role')} | {config.get('level')} | {config.get('num_questions')} Qs")

    # Build prompts
    system_prompt = build_system_prompt(config)
    first_message = build_first_message(config)

    # Create agent session with OpenAI Realtime (voice-to-voice)
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice=OPENAI_VOICE,
            temperature=0.7,
            model="gpt-4o-realtime-preview",
        ),
    )

    # Create Simli avatar (only if credentials are valid)
    if SIMLI_API_KEY and SIMLI_FACE_ID:
        try:
            avatar = simli.AvatarSession(
                simli_config=simli.SimliConfig(
                    api_key=SIMLI_API_KEY,
                    face_id=SIMLI_FACE_ID,
                ),
            )
            logger.info("🎭 Starting Simli avatar...")
            await avatar.start(session, room=ctx.room)
            logger.info("✅ Simli avatar started")
        except Exception as e:
            logger.warning(f"⚠️ Simli avatar failed: {e}. Continuing without avatar.")
    else:
        logger.warning("⚠️ No Simli credentials, running without avatar")

    # Create the agent with system prompt and first message
    agent = Agent(
        instructions=system_prompt,
    )

    # Start the agent session
    logger.info("🤖 Starting interview agent...")
    await session.start(
        agent=agent,
        room=ctx.room,
    )

    logger.info("✅ Interview agent running! Agent will greet candidate automatically.")


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            worker_type=WorkerType.ROOM,
        )
    )
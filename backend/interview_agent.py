"""
ResuMate AI — Interview Agent (LiveKit + Simli + OpenAI Realtime)

Standalone: python interview_agent.py dev
From main.py: import and call start_worker() in lifespan
"""
import os
import sys
import logging
import asyncio
import requests
from dotenv import load_dotenv

load_dotenv(override=True)

logger = logging.getLogger("resumate-interview-agent")
logger.setLevel(logging.INFO)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")
SIMLI_API_KEY = os.getenv("SIMLI_API_KEY")
SIMLI_FACE_ID = os.getenv("SIMLI_FACE_ID", "tmp9i8bbq7c")
OPENAI_VOICE = os.getenv("OPENAI_VOICE", "alloy")
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")


def get_interview_config(room_name):
    try:
        port = os.getenv("PORT", "8001")
        for url in [BACKEND_URL, f"http://localhost:{port}", "http://127.0.0.1:8001"]:
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
    return f"""You are Alex, a senior technical interviewer conducting a live video interview.
CONTEXT: Role: {role}, Level: {level}, Candidate: {candidate}, Questions: {num_qs}, Focus: {focus}
RULES: Keep responses SHORT. Ask ONE question at a time. Acknowledge answers briefly. Ask exactly {num_qs} questions. Start easy, increase difficulty. Cover {focus}. Stay in character as human interviewer Alex.
STRUCTURE: 1. IMMEDIATELY greet: "Hi {candidate}! I'm Alex, interviewing you for {role}. Let's start easy." 2. Ask questions one at a time. 3. After all questions: "Thank you {candidate}, we'll share results shortly."
VOICE: Conversational, medium pace, friendly but professional. No emojis or markdown."""


# ═══ BACKGROUND WORKER — imported by main.py ═══
async def _run_worker():
    """Run LiveKit agent worker using the Worker API directly"""
    try:
        from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, Worker
        from livekit.plugins import openai as lk_openai, simli as lk_simli
        print("✅ LiveKit agents imported successfully")
    except ImportError as e:
        print(f"❌ LiveKit agents import failed: {e}")
        return

    async def entrypoint(ctx: JobContext):
        logger.info(f"🎯 Interview agent joining room: {ctx.room.name}")
        config = get_interview_config(ctx.room.name)
        logger.info(f"📋 Config: {config.get('role')} | {config.get('num_questions')} Qs")

        session = AgentSession(
            llm=lk_openai.realtime.RealtimeModel(
                voice=OPENAI_VOICE, temperature=0.7, model="gpt-4o-realtime-preview",
            ),
        )

        if SIMLI_API_KEY and SIMLI_FACE_ID:
            try:
                avatar = lk_simli.AvatarSession(
                    simli_config=lk_simli.SimliConfig(api_key=SIMLI_API_KEY, face_id=SIMLI_FACE_ID),
                )
                await avatar.start(session, room=ctx.room)
                logger.info("🎭 Simli avatar started")
            except Exception as e:
                logger.warning(f"⚠️ Simli failed: {e}")

        await session.start(
            agent=Agent(instructions=build_system_prompt(config)),
            room=ctx.room,
        )
        logger.info("✅ Interview agent running!")

    opts = WorkerOptions(
        entrypoint_fnc=entrypoint,
        worker_type=WorkerType.ROOM,
    )

    try:
        worker = Worker(opts, loop=asyncio.get_event_loop())
        await worker.run()
    except Exception as e:
        # Worker.run() may not exist in all versions, try alternative
        print(f"Worker.run() failed ({e}), trying alternative...")
        try:
            from livekit.agents._worker import Worker as InternalWorker
            worker = InternalWorker(opts)
            await worker.run()
        except Exception as e2:
            print(f"Alternative also failed: {e2}")
            print("Interview agent will only work in standalone mode (python interview_agent.py dev)")


def start_worker():
    """Start the LiveKit worker in a background asyncio task — call from main.py lifespan"""
    if not LIVEKIT_URL or not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        print("⚠️ Interview agent: LiveKit credentials not set, skipping")
        return

    os.environ["LIVEKIT_URL"] = LIVEKIT_URL
    os.environ["LIVEKIT_API_KEY"] = LIVEKIT_API_KEY
    os.environ["LIVEKIT_API_SECRET"] = LIVEKIT_API_SECRET

    async def _bg():
        try:
            await _run_worker()
        except Exception as e:
            print(f"⚠️ Interview agent background task failed: {e}")

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_bg())
        print("✅ Interview agent: background task created")
    except RuntimeError:
        print("⚠️ No running event loop, interview agent not started")


# ═══ STANDALONE MODE ═══
if __name__ == "__main__":
    try:
        from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
        from livekit.plugins import openai as lk_openai, simli as lk_simli
    except ImportError:
        print("❌ Install: pip install livekit-agents livekit-plugins-openai livekit-plugins-simli")
        sys.exit(1)

    async def entrypoint(ctx: JobContext):
        logger.info(f"🎯 Interview agent joining room: {ctx.room.name}")
        config = get_interview_config(ctx.room.name)

        session = AgentSession(
            llm=lk_openai.realtime.RealtimeModel(
                voice=OPENAI_VOICE, temperature=0.7, model="gpt-4o-realtime-preview",
            ),
        )

        if SIMLI_API_KEY and SIMLI_FACE_ID:
            try:
                avatar = lk_simli.AvatarSession(
                    simli_config=lk_simli.SimliConfig(api_key=SIMLI_API_KEY, face_id=SIMLI_FACE_ID),
                )
                await avatar.start(session, room=ctx.room)
                logger.info("🎭 Simli avatar started")
            except Exception as e:
                logger.warning(f"⚠️ Simli failed: {e}")

        await session.start(
            agent=Agent(instructions=build_system_prompt(config)),
            room=ctx.room,
        )
        logger.info("✅ Interview agent running!")

    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
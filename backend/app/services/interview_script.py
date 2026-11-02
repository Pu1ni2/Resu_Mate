"""The interviewer's script, the same for voice and video interviews.

The base prompt (app/prompts/realtime_interview.txt) followed by a JSON block
with this interview's details. The voice room's session gets it from
app/api/realtime.py, and the video worker in its room config from
app/api/livekit_routes.py. The worker used to write a shorter script of its
own, without the voice script's rules: ask every question in order, never
stall, close properly.
"""
import json
from pathlib import Path
from typing import List

from app.models.candidate import Interview

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"


def load_prompt() -> str:
    with open(PROMPTS_DIR / "realtime_interview.txt", "r", encoding="utf-8") as f:
        return f.read()


def build_instructions(interview: Interview, candidate_name: str, max_total_minutes: int) -> str:
    """Concatenate base prompt + a JSON context block.

    The model reads the JSON literally, so field names must stay stable —
    realtime_interview.txt references them by name (questions, num_questions,
    role, level, candidate_name, tone, verification_targets, remaining_minutes).
    """
    base = load_prompt()
    questions = interview.questions or []
    # If the hiring manager never pre-generated questions, fall back to a
    # default 5-question role-aware list. The realtime model copes fine with
    # generic prompts; the report flow is the same shape regardless.
    if not questions:
        questions = [
            f"Walk me through your background and what drew you to {interview.role or 'this role'}.",
            "Tell me about a recent project you're proud of and your specific role in it.",
            "What's a technical challenge you hit recently, and how did you work through it?",
            "How do you stay current with new tools and approaches in your field?",
            "What kind of team and feedback style helps you do your best work?",
        ]

    # Resume-intelligence verification targets travel inside room_config so the
    # avatar interview's prompt builder can read the same shape. For the
    # conversational path we just surface them verbatim and let the prompt
    # decide whether to probe.
    verification_targets: List[dict] = []
    config = interview.room_config or {}
    if isinstance(config, dict):
        ri = config.get("resume_intelligence") or {}
        if isinstance(ri, dict):
            verification_targets = ri.get("verification_targets") or []

    context = {
        "candidate_name": candidate_name or "the candidate",
        "role": interview.role or "the role",
        "level": interview.level or "Mid-Level",
        "focus_areas": interview.focus_areas or [],
        "questions": questions,
        "num_questions": len(questions),
        "verification_targets": verification_targets[:4],
        "tone": "warm, sharp, direct, professional",
        "remaining_minutes": max_total_minutes,
    }
    return base + "\n\n```json\n" + json.dumps(context, ensure_ascii=False, indent=2) + "\n```\n"

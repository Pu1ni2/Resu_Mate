"""Jarvis — Conversational AI Hiring Agent
Single endpoint: POST /api/jarvis/chat
GPT-4o reads conversation + context, signals what to say and what action to take.
The frontend executes all actions against existing endpoints.
"""
import json
import logging
from typing import Optional

import openai
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.services.auth import get_current_user

logger = logging.getLogger("resumate.jarvis")

router = APIRouter(prefix="/jarvis", tags=["jarvis"])

# ── System prompt ─────────────────────────────────────────────────────────────

JARVIS_SYSTEM_PROMPT = """You are Jarvis, an elite AI hiring partner embedded in ResuMate. You help hiring managers screen candidates, create interviews, and send emails through natural back-and-forth conversation.

PERSONALITY: Warm, witty, confident. Like a sharp chief-of-staff who moves fast and knows the score. Short punchy sentences. No bullet lists. No asterisks. No markdown. Plain prose only. Under 60 words per reply.

YOUR CAPABILITIES (actions you can signal):
- run_ats: Screen all candidates against a role using ATS scoring
- batch_action: Create interviews and draft or send emails for specific candidates
- list_candidates: Summarize who is currently uploaded
- show_results: Navigate to the full results view

CONVERSATION RULES:
1. On the first message from the system (greeting): do NOT trigger any action. Just introduce yourself and ask what role they are hiring for.
2. Once you have a role name: trigger run_ats. JD, skills, and experience are optional extras — do not wait for them.
3. After ATS results appear in context: summarize the top 3 results verbally (names and scores), then ask what the hiring manager wants to do next.
4. For batch_action: figure out which candidates (top N, specific names, all strong fits) using shortlisted_ids from context. Trigger it.
5. For email sending: ALWAYS ask "Want me to send these now?" and set awaiting_confirmation=true. Never send without explicit confirmation.
6. After the user confirms sending: trigger batch_action again with send_emails=true.
7. "show results", "view results", "show me the full list" → trigger show_results.
8. If last_ats_results is already in context, do NOT re-run ATS unless the user explicitly asks.

RESPONSE FORMAT — always return valid JSON, nothing else:
{
  "reply": "plain sentence(s) — no markdown, no asterisks, no lists, max 60 words",
  "action": "run_ats" | "batch_action" | "list_candidates" | "show_results" | null,
  "action_params": { ... } | null,
  "awaiting_confirmation": false,
  "updated_context": { "role": "...", "last_action": "..." }
}

action_params shapes:
- run_ats: {"role": str, "jd_text": str or null, "required_skills": [], "min_experience_years": 0, "auto_shortlist_count": 5}
- batch_action: {"candidate_ids": [int,...], "role": str, "level": "Mid-Level", "num_questions": 8, "email_type": "interview", "send_emails": false}
- list_candidates: {}
- show_results: {}

KEY RULES:
- Resolve "top 3", "strong fits", "top candidates" to actual IDs from context.shortlisted_ids
- Never invent candidate names or scores
- Keep reply under 60 words — it will be spoken aloud
- No markdown in the reply field"""


# ── Pydantic models ───────────────────────────────────────────────────────────

class CandidateBrief(BaseModel):
    id: int
    name: str
    predicted_role: str = ""
    total_experience_years: float = 0
    skills: list = []


class JarvisContext(BaseModel):
    role: Optional[str] = None
    last_ats_results: Optional[dict] = None
    shortlisted_ids: list = []
    last_action: Optional[str] = None


class JarvisChatRequest(BaseModel):
    message: str
    conversation_history: list = []   # [{role: str, content: str}]
    candidates_summary: list = []     # [CandidateBrief dicts]
    context: JarvisContext = JarvisContext()


class JarvisChatResponse(BaseModel):
    reply: str
    action: Optional[str] = None
    action_params: Optional[dict] = None
    awaiting_confirmation: bool = False
    updated_context: dict = {}


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=JarvisChatResponse)
async def jarvis_chat(
    req: JarvisChatRequest,
    user=Depends(get_current_user),
):
    """Conversational AI hiring agent. Returns what to say + optional action signal."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    # Build context block for GPT-4o
    context_block = {
        "role": req.context.role,
        "last_action": req.context.last_action,
        "shortlisted_ids": req.context.shortlisted_ids,
        "has_ats_results": req.context.last_ats_results is not None,
    }

    # Include a brief ATS summary if available (not the full blob — too large)
    if req.context.last_ats_results:
        res = req.context.last_ats_results
        context_block["ats_summary"] = {
            "role": res.get("role"),
            "total_screened": res.get("total_screened"),
            "stats": res.get("stats"),
            "top_candidates": [
                {
                    "id": r["candidate_id"],
                    "name": r["name"],
                    "ats_score": r["ats_score"],
                    "verdict": r["verdict"],
                }
                for r in (res.get("results") or [])[:8]
            ],
        }

    candidates_block = [
        {"id": c["id"] if isinstance(c, dict) else c.id,
         "name": c["name"] if isinstance(c, dict) else c.name,
         "role": c.get("predicted_role", "") if isinstance(c, dict) else c.predicted_role,
         "exp_years": c.get("total_experience_years", 0) if isinstance(c, dict) else c.total_experience_years,
         "skills": (c.get("skills") or [] if isinstance(c, dict) else c.skills or [])[:6]}
        for c in req.candidates_summary
    ]

    user_turn_content = (
        f"User says: {req.message}\n\n"
        f"Current context: {json.dumps(context_block)}\n\n"
        f"Candidates uploaded ({len(candidates_block)} total): {json.dumps(candidates_block)}"
    )

    # Build messages for GPT-4o
    messages = [{"role": "system", "content": JARVIS_SYSTEM_PROMPT}]
    for h in req.conversation_history[-20:]:  # last 20 turns
        if isinstance(h, dict) and h.get("role") in ("user", "assistant"):
            messages.append({"role": h["role"], "content": str(h["content"])})
    messages.append({"role": "user", "content": user_turn_content})

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=400,
        )
        raw = response.choices[0].message.content or ""
        data = json.loads(raw)

        return JarvisChatResponse(
            reply=data.get("reply", "I'm not sure what to say. Could you rephrase that?"),
            action=data.get("action"),
            action_params=data.get("action_params"),
            awaiting_confirmation=bool(data.get("awaiting_confirmation", False)),
            updated_context=data.get("updated_context", {}),
        )

    except json.JSONDecodeError as e:
        logger.warning(f"Jarvis JSON parse error: {e} — raw: {raw[:200]}")
        # Return raw text as reply with no action
        return JarvisChatResponse(reply=raw[:300] if raw else "Something went wrong. Try again.")

    except Exception as e:
        logger.error(f"Jarvis error: {e}")
        raise HTTPException(status_code=500, detail=f"Jarvis error: {str(e)}")

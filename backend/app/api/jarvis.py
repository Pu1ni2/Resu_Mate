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

JARVIS_SYSTEM_PROMPT = """You are Jarvis, an elite AI hiring partner embedded in ResuMate. You help hiring managers screen candidates, create interviews, and send emails through natural conversation.

PERSONALITY: Warm, witty, confident. Short punchy sentences. Plain prose only — no bullet lists, no asterisks, no markdown. Under 60 words per reply (it will be spoken aloud).

YOUR CAPABILITIES:
- run_ats: Screen all candidates against a role
- batch_action: Create interviews and draft/send emails
- list_candidates: Summarize uploaded candidates
- show_results: Show full results view

CONVERSATION RULES:
1. Greeting message: introduce yourself, ask what role they are hiring for. No action.
2. Never re-introduce yourself after the first assistant greeting in a session.
3. If the user says thanks, bye, or small-talk before giving a role, reply naturally in one short sentence. Do not reset the conversation.
4. Once you know the role: trigger run_ats immediately. Don't wait for JD or skills.
5. After ATS results: summarize top candidates (name + score), ask what to do next.
6. For interviews/emails: trigger batch_action with send_emails=false first (draft mode).
7. CONFIRMATION RULE — read carefully:
   - If context.pending_action is NULL: ask "Want me to send these now?" and set awaiting_confirmation=true. Do NOT trigger any action yet.
   - If context.pending_action is SET and the user says yes/sure/ok/send/go ahead/do it: trigger batch_action with send_emails=true using the pending_action params. Set awaiting_confirmation=false.
   - NEVER ask "Want me to send?" if context.pending_action is already set. The user already confirmed — just send.
8. "show results" / "view results" → trigger show_results.
9. If has_ats_results is true in context, do NOT re-run ATS unless user explicitly asks to re-screen.
10. If interrupted=true in context: acknowledge the interruption naturally, incorporate both contexts.

RESPONSE FORMAT — valid JSON only, nothing else:
{
  "reply": "plain spoken sentence(s), max 60 words, no markdown",
  "action": "run_ats" | "batch_action" | "list_candidates" | "show_results" | null,
  "action_params": { ... } | null,
  "awaiting_confirmation": false,
  "updated_context": { "role": "...", "last_action": "..." }
}

action_params shapes:
- run_ats: {"role": str, "jd_text": str|null, "required_skills": [], "min_experience_years": 0, "auto_shortlist_count": 5}
- batch_action: {"candidate_ids": [int,...], "role": str, "level": "Mid-Level", "num_questions": 8, "email_type": "interview", "send_emails": false}

KEY RULES:
- Use actual IDs from context.shortlisted_ids for "top candidates", "strong fits", etc.
- Never invent names or scores
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
    pending_action: Optional[dict] = None   # set when awaiting_confirmation=true


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
        "pending_action": req.context.pending_action,   # non-null = confirmation already asked
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

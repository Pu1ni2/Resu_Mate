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

JARVIS_SYSTEM_PROMPT = """You are Jarvis, an elite AI hiring chief-of-staff embedded in ResuMate. You have full access to the hiring pipeline — screening, research, interviews, emails, LinkedIn, GitHub, Calendly, and deep candidate analysis — all through natural conversation.

PERSONALITY: Warm, direct, confident. Like a sharp colleague who moves fast. Short punchy sentences. Plain prose only — no bullet lists, no asterisks, no markdown. Under 65 words per reply (spoken aloud).

═══ YOUR FULL CAPABILITIES ═══

HIRING PIPELINE:
- run_ats:        Screen ALL uploaded candidates against a role (ATS scoring)
- batch_action:   Create interviews + draft/send emails for specific candidates
- list_candidates: Tell the user who's currently uploaded
- show_results:   Open the full ATS results view

RESEARCH & INTELLIGENCE:
- research_web:    Live web search — salary data, company info, market trends, tech comparisons
- analyze_github:  Analyze a candidate's GitHub profile (repos, languages, activity, AI summary)
- scan_candidate:  Full profile enrichment — finds GitHub AND LinkedIn from the resume, returns contact info
- deep_evaluate:   Comprehensive AI hiring report on a specific candidate for the role

SCHEDULING:
- get_calendly:   Get the hiring manager's Calendly scheduling link to share with candidates

═══ CONVERSATION RULES ═══

1. Greeting: introduce yourself briefly, ask what role they are hiring for. No action.
2. Never re-introduce yourself after the first message in a session.
3. Small-talk / thanks / bye / off-topic: reply naturally in one sentence. Stay in context.
4. Once you know the role: trigger run_ats immediately. Don't wait for JD or skills.
5. After ATS results: say top 2-3 candidates with names and scores. Ask what to do next.
6. For mail/interview: trigger batch_action with send_emails=false, awaiting_confirmation=false. The frontend shows the email draft card automatically with a Send button.
7. If context.last_action is "batch_action" and user says send/yes/sure/do it/go ahead/send it: trigger batch_action with send_emails=true, awaiting_confirmation=false. NEVER ask "Want me to send?" — the draft card handles that.
8. "show results" / "view results" / "full list" → show_results.
9. If has_ats_results is true in context, do NOT re-run ATS unless user explicitly asks to re-screen.
10. If interrupted=true in context: acknowledge it naturally, fold the new input into your reply.

═══ TRIGGER RULES (MANDATORY — follow exactly) ═══

DEEP_EVALUATE IS REQUIRED when the user says ANY of these words — do NOT answer from memory, ALWAYS trigger the action:
- "drawbacks" → deep_evaluate (MANDATORY, even if you think you know the answer)
- "weaknesses" → deep_evaluate (MANDATORY)
- "cons" / "flaws" / "negatives" → deep_evaluate (MANDATORY)
- "report" / "evaluation report" / "full report" → deep_evaluate (MANDATORY)
- "detailed analysis" / "deep dive" / "assess" / "evaluate" → deep_evaluate (MANDATORY)
- "how good is" / "more analysis" → deep_evaluate (MANDATORY)

RULE: If you have NOT yet seen [EVAL_RESULT] in conversation history, trigger deep_evaluate. If [EVAL_RESULT] already exists in history, read the Growth Areas from it directly — do NOT re-trigger. Never answer drawbacks/weaknesses from ATS scores or GitHub data alone — that is not a full evaluation.

ANALYZE_GITHUB triggers:
- "github" / "code" / "repos" / "projects" / "what did he build" → analyze_github ONLY if no [GITHUB_RESULT] in history for this candidate

SCAN triggers:
- "linkedin" / "full profile" / "enrich" / "scan" / "find his linkedin" → scan_candidate

RESEARCH triggers:
- "search" / "market rate" / "salary" / "research" / "what's the going rate" / "company info" → research_web

CALENDLY triggers:
- "calendly" / "schedule" / "booking link" / "send calendar link" → get_calendly

GITHUB CACHE RULE (CRITICAL): If [GITHUB_RESULT] already appears in conversation history, NEVER trigger analyze_github again. Answer directly from that cached data — name the specific projects listed there.

═══ RESULT NARRATION RULES ═══

After receiving any [RESULT] system message: narrate 2-3 key findings in plain spoken language. Be specific — names, numbers, project names. No markdown. No asterisks.

[GITHUB_RESULT] narration: Name top 2-3 project names specifically. State the primary language. Give a 1-sentence technical impression. Example: "He has 13 repos. His main projects are Resu_Mate and DataPipeline, both in Python. Strong AI focus."

[EVAL_RESULT] narration RULES (FOLLOW EXACTLY):
1. Always state the score number (e.g. "He scored 82 out of 100").
2. Always read at least 2 specific bullet points from the "Growth Areas" section — these are the actual weaknesses. Be literal — copy the specific gaps mentioned (e.g. "Limited cloud deployment experience" not just "some gaps").
3. State at least 1 strength from "Strengths & Matches".
4. If user asked specifically about drawbacks/weaknesses, lead with Growth Areas FIRST, then strengths after.
5. Never give a generic one-liner. Never say "he could improve in some areas". Always be specific.

═══ RESPONSE FORMAT ═══

Always return valid JSON, nothing else:
{
  "reply": "plain spoken text, max 65 words, no markdown",
  "action": "run_ats"|"batch_action"|"list_candidates"|"show_results"|"research_web"|"analyze_github"|"scan_candidate"|"deep_evaluate"|"get_calendly"|null,
  "action_params": {...}|null,
  "awaiting_confirmation": false,
  "updated_context": {"role": "...", "last_action": "..."}
}

action_params shapes:
- run_ats:        {"role": str, "jd_text": str|null, "required_skills": [], "min_experience_years": 0, "auto_shortlist_count": 5}
- batch_action:   {"candidate_ids": [int,...], "role": str, "level": "Mid-Level", "num_questions": 8, "email_type": "interview", "send_emails": false}
- research_web:   {"query": str}
- analyze_github: {"candidate_id": int, "candidate_name": str}
- scan_candidate: {"candidate_id": int, "candidate_name": str}
- deep_evaluate:  {"candidate_id": int, "role": str}
- get_calendly:   {}

ABSOLUTE RULES:
- Resolve "top candidates", "strong fits", "him/her/this candidate" to context.active_candidate.id first, then context.shortlisted_ids[0]
- For deep_evaluate: use context.active_candidate.id and context.role when user says "drawbacks/report/evaluate" without naming someone
- Never invent names, scores, GitHub usernames, or facts
- No markdown in the reply field — it will be read aloud
- NEVER answer drawbacks/weaknesses questions from ATS or GitHub data — always trigger deep_evaluate first"""


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
    # Resolve the "active" candidate — most recently discussed shortlisted candidate
    first_shortlisted_id = (req.context.shortlisted_ids or [None])[0]
    active_candidate = None
    if first_shortlisted_id and req.candidates_summary:
        for c in req.candidates_summary:
            cid = c["id"] if isinstance(c, dict) else c.id
            if cid == first_shortlisted_id:
                active_candidate = {
                    "id": cid,
                    "name": c["name"] if isinstance(c, dict) else c.name,
                }
                break

    context_block = {
        "role": req.context.role,
        "last_action": req.context.last_action,
        "shortlisted_ids": req.context.shortlisted_ids,
        "has_ats_results": req.context.last_ats_results is not None,
        "pending_action": req.context.pending_action,   # non-null = confirmation already asked
        "active_candidate": active_candidate,  # use this ID for deep_evaluate / analyze_github when user says "him"
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
            temperature=0.3,
            max_tokens=500,
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

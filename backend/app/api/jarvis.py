"""Jarvis -- Conversational AI hiring orchestrator."""
import json
import logging
import re
from typing import Any, Dict, List, Optional

import openai
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.auth import get_current_user

logger = logging.getLogger("resumate.jarvis")

router = APIRouter(prefix="/jarvis", tags=["jarvis"])


JARVIS_SYSTEM_PROMPT = """You are Jarvis, an elite AI hiring chief-of-staff embedded in ResuMate.

PERSONALITY:
- Warm, sharp, direct, human.
- Speak like a trusted colleague.
- Plain prose only. No markdown. No bullets. Under 65 words per spoken reply.

YOU CAN ORCHESTRATE:
- run_ats: screen all uploaded candidates for a role
- batch_action: create interviews and draft/send emails for multiple candidates
- list_candidates: say who is uploaded
- show_results: open the full ATS results view
- research_web: live search for salary, company, market, role research
- analyze_github: analyze one candidate's GitHub
- scan_candidate: find LinkedIn, GitHub, contact info, public profile data
- deep_evaluate: full hiring evaluation for one candidate
- resume_intelligence: gaps, red flags, verification targets, resume confidence
- create_interview: create one interview and grant candidate access
- get_interview_report: fetch a completed interview report
- credibility_analysis: compare resume claims with interview performance
- export_report: export the PDF report for a candidate
- get_calendly: fetch the hiring manager's Calendly scheduling link

IMPORTANT CONTEXT:
- You receive context.role, context.active_candidate, shortlisted_ids, ATS summary, and cached artifacts.
- Cached artifacts are trusted memory. Reuse them unless the user explicitly asks to rerun, refresh, rescan, or recheck.
- When the user says him, her, this candidate, the strongest one, top candidate, or the last person discussed, use context.active_candidate first.

WORKFLOW RULES:
1. Greeting: briefly introduce yourself and ask what role they are hiring for. No action.
2. Once you know the role, run ATS unless ATS results already exist and the user did not ask to rescreen.
3. After ATS, mention the top 2-3 candidates and keep the strongest one as the active candidate.
4. If the user asks for top N interviews or emails, use batch_action.
5. If the user asks about a single candidate interview setup, use create_interview.
6. If the user says send it, yes send, go ahead, or similar after an email draft flow, trigger batch_action with send_emails=true.
7. Prefer cached GitHub, scan, evaluation, resume intelligence, interview report, and credibility artifacts when available.
8. Only ask a short follow-up when a required field is truly missing, like candidate email for create_interview with no known email.
9. Ask at most one follow-up question per turn.

TRIGGER GUIDE:
- ATS / ranking / shortlist / screen / best fit -> run_ats
- who do we have / list candidates -> list_candidates
- show results / full list / open results -> show_results
- github / code / repos / projects -> analyze_github unless cached artifact already answers it
- linkedin / full profile / contact / scan -> scan_candidate unless cached artifact already answers it
- drawbacks / weaknesses / negatives / report / evaluate / assess / deep dive -> deep_evaluate unless cached evaluation exists
- red flags / resume gaps / verification targets / resume confidence -> resume_intelligence unless cached
- schedule interview / create interview for one named candidate -> create_interview
- invite top 3 / set up interviews for shortlist / email top candidates -> batch_action
- interview result / interview report / how did the interview go -> get_interview_report unless cached
- credibility / did they exaggerate / resume vs interview -> credibility_analysis unless cached
- export pdf / download report -> export_report
- calendly / booking link / scheduling link -> get_calendly
- salary / market rate / company research / latest / current -> research_web

RESULT USAGE:
- If cached evaluation exists, use it directly for drawbacks and strengths.
- If cached GitHub exists, name specific projects from it.
- If cached resume intelligence exists, use its gaps, red flags, and verification targets.
- If cached interview report exists, use its score, violations, eye contact, and report summary.
- If cached credibility exists, use its score and recommendation.

RETURN ONLY VALID JSON:
{
  "reply": "plain spoken text, max 65 words, no markdown",
  "action": "run_ats"|"batch_action"|"list_candidates"|"show_results"|"research_web"|"analyze_github"|"scan_candidate"|"deep_evaluate"|"resume_intelligence"|"create_interview"|"get_interview_report"|"credibility_analysis"|"export_report"|"get_calendly"|null,
  "action_params": {...}|null,
  "awaiting_confirmation": false,
  "updated_context": {
    "role": "...",
    "last_action": "...",
    "active_candidate_id": 123,
    "active_candidate_name": "Name"
  }
}

ACTION PARAMS:
- run_ats: {"role": str, "jd_text": str|null, "required_skills": [], "min_experience_years": 0, "auto_shortlist_count": 5}
- batch_action: {"candidate_ids": [int,...], "role": str, "level": "Mid-Level", "num_questions": 8, "email_type": "interview", "send_emails": false}
- research_web: {"query": str}
- analyze_github: {"candidate_id": int, "candidate_name": str}
- scan_candidate: {"candidate_id": int, "candidate_name": str}
- deep_evaluate: {"candidate_id": int, "candidate_name": str, "role": str}
- resume_intelligence: {"candidate_id": int, "candidate_name": str}
- create_interview: {"candidate_id": int, "candidate_name": str, "candidate_email": str, "role": str, "level": "Mid-Level", "num_questions": 8, "focus_areas": []}
- get_interview_report: {"candidate_id": int, "candidate_name": str, "candidate_email": str}
- credibility_analysis: {"candidate_id": int, "candidate_name": str, "candidate_email": str}
- export_report: {"candidate_id": int, "candidate_name": str, "candidate_email": str}
- get_calendly: {}

ABSOLUTE RULES:
- Never invent names, scores, usernames, or emails.
- Prefer the active candidate when the user is vague.
- If a required email is missing, say that briefly and avoid the action.
- Keep spoken replies concise and natural."""


ALLOWED_ACTIONS = {
    "run_ats",
    "batch_action",
    "list_candidates",
    "show_results",
    "research_web",
    "analyze_github",
    "scan_candidate",
    "deep_evaluate",
    "resume_intelligence",
    "create_interview",
    "get_interview_report",
    "credibility_analysis",
    "export_report",
    "get_calendly",
}

CANDIDATE_ACTIONS = {
    "analyze_github",
    "scan_candidate",
    "deep_evaluate",
    "resume_intelligence",
    "create_interview",
    "get_interview_report",
    "credibility_analysis",
    "export_report",
}

ROLE_REQUIRED_ACTIONS = {
    "run_ats",
    "batch_action",
    "deep_evaluate",
    "create_interview",
}

EMAIL_REQUIRED_ACTIONS = {
    "create_interview",
    "get_interview_report",
    "credibility_analysis",
    "export_report",
}

AMBIGUOUS_KICKOFF_MESSAGES = {
    "hi",
    "hello",
    "hey",
    "start",
    "go",
    "go ahead",
    "continue",
    "yes",
    "ok",
    "okay",
    "sure",
    "proceed",
}

AMBIGUOUS_KICKOFF_WORDS = {
    "hi",
    "hello",
    "hey",
    "start",
    "go",
    "continue",
    "yes",
    "ok",
    "okay",
    "sure",
    "proceed",
    "please",
}

COUNT_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
}


class CandidateBrief(BaseModel):
    id: int
    name: str
    predicted_role: str = ""
    total_experience_years: float = 0
    experience_level: str = ""
    location: str = ""
    email: str = ""
    skills: List[Any] = Field(default_factory=list)
    github_url: str = ""
    linkedin_url: str = ""


class JarvisContext(BaseModel):
    role: Optional[str] = None
    last_ats_results: Optional[dict] = None
    shortlisted_ids: List[int] = Field(default_factory=list)
    last_action: Optional[str] = None
    pending_action: Optional[dict] = None
    active_candidate_id: Optional[int] = None
    active_candidate_name: Optional[str] = None
    interrupted: bool = False
    artifacts: Dict[str, Any] = Field(default_factory=dict)


class JarvisChatRequest(BaseModel):
    message: str
    conversation_history: List[dict] = Field(default_factory=list)
    candidates_summary: List[dict] = Field(default_factory=list)
    context: JarvisContext = Field(default_factory=JarvisContext)


class JarvisChatResponse(BaseModel):
    reply: str
    action: Optional[str] = None
    action_params: Optional[dict] = None
    awaiting_confirmation: bool = False
    updated_context: dict = Field(default_factory=dict)


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _is_ambiguous_kickoff(message: str) -> bool:
    msg = _normalize_text(message)
    if not msg:
        return True
    if msg in AMBIGUOUS_KICKOFF_MESSAGES:
        return True
    words = [w for w in re.split(r"[^a-z0-9]+", msg) if w]
    if words and len(words) <= 3 and all(w in AMBIGUOUS_KICKOFF_WORDS for w in words):
        return True
    return False


def _candidate_to_dict(candidate: Any) -> Dict[str, Any]:
    if isinstance(candidate, dict):
        return {
            "id": candidate.get("id"),
            "name": candidate.get("name", ""),
            "predicted_role": candidate.get("predicted_role", ""),
            "total_experience_years": candidate.get("total_experience_years", 0),
            "experience_level": candidate.get("experience_level", ""),
            "location": candidate.get("location", ""),
            "email": candidate.get("email", ""),
            "skills": candidate.get("skills") or [],
            "github_url": candidate.get("github_url", ""),
            "linkedin_url": candidate.get("linkedin_url", ""),
        }
    return {
        "id": candidate.id,
        "name": getattr(candidate, "name", ""),
        "predicted_role": getattr(candidate, "predicted_role", ""),
        "total_experience_years": getattr(candidate, "total_experience_years", 0),
        "experience_level": getattr(candidate, "experience_level", ""),
        "location": getattr(candidate, "location", ""),
        "email": getattr(candidate, "email", ""),
        "skills": getattr(candidate, "skills", []) or [],
        "github_url": getattr(candidate, "github_url", ""),
        "linkedin_url": getattr(candidate, "linkedin_url", ""),
    }


def _get_candidate_by_id(candidates: List[Dict[str, Any]], candidate_id: Optional[int]) -> Optional[Dict[str, Any]]:
    if candidate_id is None:
        return None
    for candidate in candidates:
        if candidate.get("id") == candidate_id:
            return candidate
    return None


def _find_candidate_mentioned(message: str, candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    msg = _normalize_text(message)
    if not msg:
        return None

    by_full_name = sorted(
        [c for c in candidates if c.get("name")],
        key=lambda c: len(c.get("name", "")),
        reverse=True,
    )
    for candidate in by_full_name:
        name = _normalize_text(candidate.get("name", ""))
        if name and name in msg:
            return candidate

    first_name_matches: Dict[str, List[Dict[str, Any]]] = {}
    for candidate in candidates:
        first_name = _normalize_text(candidate.get("name", "").split(" ")[0])
        if first_name:
            first_name_matches.setdefault(first_name, []).append(candidate)

    for first_name, matched_candidates in first_name_matches.items():
        if len(matched_candidates) != 1:
            continue
        if re.search(rf"\b{re.escape(first_name)}\b", msg):
            return matched_candidates[0]

    return None


def _extract_top_n(message: str, default: int = 3) -> int:
    msg = _normalize_text(message)
    digit_match = re.search(r"top\s+(\d+)", msg)
    if digit_match:
        return max(1, min(int(digit_match.group(1)), 10))
    for word, value in COUNT_WORDS.items():
        if f"top {word}" in msg:
            return value
    return default


def _get_candidate_email(candidate: Optional[Dict[str, Any]], artifacts: Dict[str, Any], candidate_id: Optional[int]) -> str:
    if candidate and candidate.get("email"):
        return candidate["email"]

    cid = str(candidate_id) if candidate_id is not None else None
    if not cid:
        return ""

    scans = artifacts.get("scans") or {}
    scan_contact = (scans.get(cid) or {}).get("contact") or {}
    if scan_contact.get("email"):
        return scan_contact["email"]

    interviews = artifacts.get("interviews") or {}
    interview = interviews.get(cid) or {}
    if interview.get("candidateEmail"):
        return interview["candidateEmail"]

    reports = artifacts.get("interviewReports") or {}
    report = reports.get(cid) or {}
    if report.get("candidateEmail"):
        return report["candidateEmail"]

    credibility = artifacts.get("credibility") or {}
    credibility_item = credibility.get(cid) or {}
    if credibility_item.get("candidateEmail"):
        return credibility_item["candidateEmail"]

    return ""


def _compress_candidate_artifacts(items: Dict[str, Any], fields: List[str], limit: int = 5) -> Dict[str, Any]:
    compressed: Dict[str, Any] = {}
    for candidate_id, payload in list((items or {}).items())[:limit]:
        if not isinstance(payload, dict):
            continue
        slim = {}
        for field in fields:
            value = payload.get(field)
            if value in (None, "", [], {}):
                continue
            slim[field] = value
        if slim:
            compressed[str(candidate_id)] = slim
    return compressed


def _build_artifacts_overview(artifacts: Dict[str, Any]) -> Dict[str, Any]:
    artifacts = artifacts or {}
    return {
        "github": _compress_candidate_artifacts(
            artifacts.get("github") or {},
            ["name", "summary", "topProjects", "languages"],
        ),
        "scans": _compress_candidate_artifacts(
            artifacts.get("scans") or {},
            ["summary", "contact", "githubUsername", "linkedinHeadline"],
        ),
        "evaluations": _compress_candidate_artifacts(
            artifacts.get("evaluations") or {},
            ["role", "score", "verdict", "strengths", "weaknesses", "summary"],
        ),
        "resume_intel": _compress_candidate_artifacts(
            artifacts.get("resumeIntel") or {},
            ["confidence", "gaps", "redFlags", "verificationTargets"],
        ),
        "interviews": _compress_candidate_artifacts(
            artifacts.get("interviews") or {},
            ["candidateEmail", "role", "level", "numQuestions", "focusAreas", "status"],
        ),
        "interview_reports": _compress_candidate_artifacts(
            artifacts.get("interviewReports") or {},
            ["candidateEmail", "avgScore", "eyeContact", "violations", "summary"],
        ),
        "credibility": _compress_candidate_artifacts(
            artifacts.get("credibility") or {},
            ["candidateEmail", "credibilityScore", "recommendation", "keyInsights"],
        ),
        "research": artifacts.get("research") or {},
    }


def _resolve_active_candidate(
    message: str,
    context: JarvisContext,
    candidates: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    mentioned = _find_candidate_mentioned(message, candidates)
    if mentioned:
        return mentioned

    active = _get_candidate_by_id(candidates, context.active_candidate_id)
    if active:
        return active

    for candidate_id in context.shortlisted_ids or []:
        shortlisted = _get_candidate_by_id(candidates, candidate_id)
        if shortlisted:
            return shortlisted

    return candidates[0] if candidates else None


def _normalize_action_payload(
    req: JarvisChatRequest,
    candidates: List[Dict[str, Any]],
    action: Optional[str],
    action_params: Dict[str, Any],
    updated_context: Dict[str, Any],
) -> tuple[Optional[str], Optional[Dict[str, Any]], Dict[str, Any]]:
    if action not in ALLOWED_ACTIONS:
        return None, None, updated_context

    params = dict(action_params or {})
    artifacts = req.context.artifacts or {}
    resolved_candidate = _resolve_active_candidate(req.message, req.context, candidates)

    if resolved_candidate and not updated_context.get("active_candidate_id"):
        updated_context["active_candidate_id"] = resolved_candidate["id"]
        updated_context["active_candidate_name"] = resolved_candidate["name"]

    if action in CANDIDATE_ACTIONS:
        target = _get_candidate_by_id(candidates, params.get("candidate_id"))
        if not target:
            target = _find_candidate_mentioned(req.message, candidates) or resolved_candidate
        if target:
            params.setdefault("candidate_id", target["id"])
            params.setdefault("candidate_name", target["name"])
            email = _get_candidate_email(target, artifacts, target["id"])
            if email:
                params.setdefault("candidate_email", email)
            updated_context["active_candidate_id"] = target["id"]
            updated_context["active_candidate_name"] = target["name"]

    if action == "run_ats":
        params.setdefault("role", req.context.role or "")
        params.setdefault("required_skills", [])
        params.setdefault("min_experience_years", 0)
        params.setdefault("auto_shortlist_count", 5)

    elif action == "batch_action":
        if not params.get("candidate_ids"):
            shortlist = req.context.shortlisted_ids or []
            if shortlist:
                params["candidate_ids"] = shortlist[:_extract_top_n(req.message)]
            elif resolved_candidate:
                params["candidate_ids"] = [resolved_candidate["id"]]
        params.setdefault("role", req.context.role or "")
        params.setdefault("level", "Mid-Level")
        params.setdefault("num_questions", 8)
        params.setdefault("email_type", "interview")
        params.setdefault("send_emails", False)

    elif action == "research_web":
        params.setdefault("query", req.message.strip())

    elif action in {"deep_evaluate", "create_interview"}:
        params.setdefault("role", req.context.role or "")

    if action == "create_interview":
        params.setdefault("level", "Mid-Level")
        params.setdefault("num_questions", 8)
        params.setdefault("focus_areas", [])

    updated_context.setdefault("last_action", action)
    if req.context.role and not updated_context.get("role"):
        updated_context["role"] = req.context.role

    return action, params, updated_context


def _apply_action_guards(
    req: JarvisChatRequest,
    candidates: List[Dict[str, Any]],
    reply: str,
    action: Optional[str],
    action_params: Optional[Dict[str, Any]],
    awaiting_confirmation: bool,
) -> tuple[str, Optional[str], Optional[Dict[str, Any]], bool]:
    params = dict(action_params or {})

    effective_role = str(params.get("role") or req.context.role or "").strip()
    if action in ROLE_REQUIRED_ACTIONS and not effective_role:
        return (
            "Happy to help. What role are you hiring for?",
            None,
            None,
            False,
        )

    if action in EMAIL_REQUIRED_ACTIONS and not str(params.get("candidate_email") or "").strip():
        target = _get_candidate_by_id(candidates, params.get("candidate_id")) or _resolve_active_candidate(
            req.message, req.context, candidates
        )
        candidate_name = params.get("candidate_name") or (target or {}).get("name") or "that candidate"
        return (
            f"I can do that for {candidate_name}, but I need their email first. Want me to scan their profile to find it?",
            None,
            None,
            False,
        )

    return reply, action, params, awaiting_confirmation


@router.post("/chat", response_model=JarvisChatResponse)
async def jarvis_chat(
    req: JarvisChatRequest,
    user=Depends(get_current_user),
):
    """Conversational AI hiring agent."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    candidates = [_candidate_to_dict(candidate) for candidate in req.candidates_summary]
    active_candidate = _resolve_active_candidate(req.message, req.context, candidates)

    # Deterministic kickoff guard: if role is still unknown and the user sends
    # an ambiguous prompt, explicitly ask for the hiring role.
    if not req.context.role and req.context.last_ats_results is None and _is_ambiguous_kickoff(req.message):
        return JarvisChatResponse(
            reply="Happy to help. What role are you hiring for?",
            action=None,
            action_params=None,
            awaiting_confirmation=False,
            updated_context={"last_action": "ask_role"},
        )

    context_block: Dict[str, Any] = {
        "role": req.context.role,
        "last_action": req.context.last_action,
        "shortlisted_ids": req.context.shortlisted_ids,
        "has_ats_results": req.context.last_ats_results is not None,
        "pending_action": req.context.pending_action,
        "active_candidate": (
            {
                "id": active_candidate["id"],
                "name": active_candidate["name"],
                "email": active_candidate.get("email", ""),
                "predicted_role": active_candidate.get("predicted_role", ""),
            }
            if active_candidate
            else None
        ),
        "interrupted": req.context.interrupted,
        "artifacts_overview": _build_artifacts_overview(req.context.artifacts),
    }

    if req.context.last_ats_results:
        res = req.context.last_ats_results
        context_block["ats_summary"] = {
            "role": res.get("role"),
            "total_screened": res.get("total_screened"),
            "stats": res.get("stats"),
            "top_candidates": [
                {
                    "id": row["candidate_id"],
                    "name": row["name"],
                    "ats_score": row["ats_score"],
                    "verdict": row["verdict"],
                }
                for row in (res.get("results") or [])[:8]
            ],
        }

    candidates_block = [
        {
            "id": candidate["id"],
            "name": candidate["name"],
            "role": candidate.get("predicted_role", ""),
            "exp_years": candidate.get("total_experience_years", 0),
            "experience_level": candidate.get("experience_level", ""),
            "location": candidate.get("location", ""),
            "email": candidate.get("email", ""),
            "skills": candidate.get("skills", [])[:6],
        }
        for candidate in candidates
    ]

    user_turn_content = (
        f"User says: {req.message}\n\n"
        f"Current context: {json.dumps(context_block)}\n\n"
        f"Candidates uploaded ({len(candidates_block)} total): {json.dumps(candidates_block)}"
    )

    messages = [{"role": "system", "content": JARVIS_SYSTEM_PROMPT}]
    for history_item in req.conversation_history[-20:]:
        if isinstance(history_item, dict) and history_item.get("role") in ("user", "assistant"):
            messages.append({"role": history_item["role"], "content": str(history_item["content"])})
    messages.append({"role": "user", "content": user_turn_content})

    raw = ""
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.25,
            max_tokens=700,
        )
        raw = response.choices[0].message.content or ""
        data = json.loads(raw)

        updated_context = data.get("updated_context")
        if not isinstance(updated_context, dict):
            updated_context = {}

        action_params = data.get("action_params")
        if not isinstance(action_params, dict):
            action_params = {}

        action, action_params, updated_context = _normalize_action_payload(
            req=req,
            candidates=candidates,
            action=data.get("action"),
            action_params=action_params,
            updated_context=updated_context,
        )

        reply, action, action_params, awaiting_confirmation = _apply_action_guards(
            req=req,
            candidates=candidates,
            reply=data.get("reply", "I'm not sure what to say. Could you rephrase that?"),
            action=action,
            action_params=action_params,
            awaiting_confirmation=bool(data.get("awaiting_confirmation", False)),
        )

        return JarvisChatResponse(
            reply=reply,
            action=action,
            action_params=action_params,
            awaiting_confirmation=awaiting_confirmation,
            updated_context=updated_context,
        )

    except json.JSONDecodeError as exc:
        logger.warning("Jarvis JSON parse error: %s -- raw: %s", exc, raw[:200])
        return JarvisChatResponse(reply=raw[:300] if raw else "Something went wrong. Try again.")

    except Exception as exc:
        logger.error("Jarvis error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Jarvis error: {str(exc)}")

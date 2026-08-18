"""
Chat API — Thin layer routing requests to agents.
Same endpoint URLs as before — frontend doesn't need to change.
"""
import os
import re
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
import io

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth import get_current_user, get_current_candidate, decode_token
from app.services.resume_rag import resume_rag
from app.core.config import settings
from app.core.database import get_db
from app.services import db_service
from app.agents.data_agent import data_agent
from app.agents.hr_agent import hr_agent
from app.agents.technical_agent import technical_agent
from app.agents.research_agent import research_agent
from app.tools.openai_tool import openai_tool
from app.tools.voice_tool import voice_tool
from app.tools.github_tool import github_tool
from app.tools.tavily_tool import tavily_tool

router = APIRouter(prefix="/chat", tags=["Chat"])

# Per-IP rate limiter for the LLM-heavy endpoints. slowapi reads app.state.limiter
# (registered in main.py) at request time, so this Limiter only contributes the
# decorator — limits are still tracked globally.
limiter = Limiter(key_func=get_remote_address)

# ═══════ REQUEST MODELS ═══════

class ChatRequest(BaseModel):
    message: str = Field(..., max_length=4000)
    candidate_ids: list = Field(default_factory=list, max_length=100)
    conversation_id: str = Field(default="default", max_length=120)
    anonymize: bool = False

class FocusChatRequest(BaseModel):
    message: str = Field(..., max_length=4000)
    candidate_id: int
    conversation_history: list = Field(default_factory=list, max_length=40)
    anonymize: bool = False
    candidate_data: Optional[dict] = None
    scan_data: Optional[dict] = None
    scan_contact: Optional[dict] = None

class WebSearchRequest(BaseModel):
    query: str = Field(..., max_length=500)
    candidate_id: Optional[int] = None
    candidate_name: Optional[str] = Field(default=None, max_length=200)

class HiringAgentRequest(BaseModel):
    candidate_id: int
    role: Optional[str] = None
    experience_required: Optional[str] = None
    level: Optional[str] = None
    job_description: Optional[str] = None
    anonymize: bool = False
    candidate_data: Optional[dict] = None

class EmailDraftRequest(BaseModel):
    candidate_id: int
    email_type: str
    evaluation_report: Optional[str] = None
    anonymize: bool = False
    candidate_data: Optional[dict] = None

class GitHubRequest(BaseModel):
    candidate_id: int
    github_username: Optional[str] = None
    github_url: Optional[str] = None     # direct URL override from frontend (PDF hyperlinks)
    anonymize: bool = False
    candidate_data: Optional[dict] = None

class ScanRequest(BaseModel):
    candidate_id: int
    anonymize: bool = False
    candidate_data: Optional[dict] = None

class GenerateQuestionsRequest(BaseModel):
    role: str = Field(default="General", max_length=120)
    level: str = Field(default="Mid-Level", max_length=60)
    num_questions: int = Field(default=8, ge=1, le=25)
    focus_areas: list = Field(default_factory=list, max_length=20)
    candidate_name: str = Field(default="Candidate", max_length=200)

class ScoreAnswerRequest(BaseModel):
    question: str
    answer: str
    role: str = "General"
    candidate_name: str = "Candidate"

class InterviewReportRequest(BaseModel):
    candidate_name: str = Field(..., max_length=200)
    candidate_email: str = Field(..., max_length=320)
    role: str = Field(..., max_length=200)
    questions: list = Field(..., max_length=50)
    answers: list = Field(..., max_length=50)
    scores: list = Field(..., max_length=50)
    duration: int = Field(default=0, ge=0, le=24 * 60 * 60)
    transcript: Optional[list] = Field(default=None, max_length=2000)

class CreateInterviewRequest(BaseModel):
    candidate_id: int
    candidate_email: str = Field(..., max_length=320)
    candidate_name: Optional[str] = Field(default=None, max_length=200)
    role: Optional[str] = Field(default=None, max_length=200)
    level: Optional[str] = Field(default=None, max_length=60)
    experience_required: Optional[str] = Field(default=None, max_length=120)
    num_questions: int = Field(default=8, ge=1, le=25)
    focus_areas: Optional[list] = Field(default=None, max_length=20)
    # Interview format: "avatar" = LiveKit + Simli avatar; "conversational" =
    # audio-only OpenAI Realtime via WebRTC. Defaults to avatar to preserve
    # existing client behaviour.
    mode: str = Field(default="avatar", max_length=20)

class VerifyEmailRequest(BaseModel):
    email: str

class SaveTranscriptRequest(BaseModel):
    candidate_email: str = Field(..., max_length=320)
    candidate_name: str = Field(default="Candidate", max_length=200)
    role: str = Field(default="General", max_length=200)
    questions: list = Field(default_factory=list, max_length=50)
    answers: list = Field(default_factory=list, max_length=50)
    scores: list = Field(default_factory=list, max_length=50)
    duration: int = Field(default=0, ge=0, le=24 * 60 * 60)
    transcript: Optional[list] = Field(default=None, max_length=2000)

# ═══════ HELPER ═══════

def _get_candidate(candidate_id: int, candidate_data: dict = None, manager_id=None) -> dict:
    """Get a candidate from the RAG store, scoped to the owning manager.

    Falls back to frontend-supplied candidate_data only when nothing is stored
    for this manager — this preserves the ad-hoc "analyze this pasted data"
    path while ensuring a stored candidate from another tenant is never
    returned.
    """
    candidate = resume_rag.get_candidate(candidate_id, manager_id=manager_id)
    if not candidate and candidate_data:
        candidate = candidate_data
    return candidate

# ═══════ CHAT ENDPOINTS ═══════
#
# chat_histories is a bounded LRU. Without a cap the dict grew with every new
# conversation_id and was never evicted, which leaked memory under load and
# survived only until restart anyway. For real cross-restart persistence the
# advisor_sessions DB pattern is the right answer; for the dashboard's
# free-form chat the value of persistence isn't worth the DB hit.
from collections import OrderedDict
_CHAT_MAX_CONVERSATIONS = 256
_CHAT_MAX_MESSAGES_PER_CONVO = 20
chat_histories: "OrderedDict[str, list]" = OrderedDict()


def _remember_chat(conversation_id: str, user_msg: str, assistant_msg: str) -> None:
    convo = chat_histories.pop(conversation_id, [])
    convo.append({"role": "user", "content": user_msg})
    convo.append({"role": "assistant", "content": assistant_msg})
    chat_histories[conversation_id] = convo[-_CHAT_MAX_MESSAGES_PER_CONVO:]
    while len(chat_histories) > _CHAT_MAX_CONVERSATIONS:
        chat_histories.popitem(last=False)  # drop the oldest conversation


@router.post("/send")
@limiter.limit("30/minute")
async def send_message(request: Request, req: ChatRequest, user=Depends(get_current_user)):
    """Multi-candidate RAG chat"""
    try:
        history = chat_histories.get(req.conversation_id, [])
        response = await resume_rag.chat(req.message, req.candidate_ids, history, req.anonymize, manager_id=user.id)
        _remember_chat(req.conversation_id, req.message, response.get("response", ""))
        return response
    except Exception as e:
        return {"response": f"Error: {str(e)}", "suggestions": []}

@router.get("/intro")
async def get_intro(count: int = 0, anonymize: bool = False, user=Depends(get_current_user)):
    """Get chat intro message"""
    return resume_rag.get_intro_message(count, anonymize)

@router.post("/clear")
async def clear_chat(user=Depends(get_current_user)):
    resume_rag.recently_discussed = []
    chat_histories.clear()
    return {"status": "cleared"}

# ═══════ VOICE ENDPOINTS ═══════

@router.post("/speech-to-text")
async def speech_to_text(audio: UploadFile = File(...), user=Depends(get_current_user)):
    try:
        audio_data = await audio.read()
        text = await voice_tool.speech_to_text(audio_data, audio.filename or "audio.webm")
        return {"text": text}
    except Exception as e:
        return {"error": str(e), "text": ""}

@router.post("/text-to-speech")
async def text_to_speech(req: dict, user=Depends(get_current_user)):
    try:
        text = req.get("text", "")
        if not text or not text.strip():
            raise HTTPException(400, "No text provided")
        voice_name = req.get("voice", "nova")
        audio_bytes = await voice_tool.text_to_speech(text, voice_name)
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[TTS] 500 error: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"TTS failed: {type(e).__name__}: {e}")

# ═══════ FOCUS CHAT → Research Agent + LLM ═══════

@router.post("/focus")
async def focus_chat(req: FocusChatRequest, user=Depends(get_current_user)):
    """Single-candidate deep chat — powered by Research Agent for auto web search"""
    try:
        candidate = _get_candidate(req.candidate_id, req.candidate_data, manager_id=user.id)
        if not candidate:
            return {"response": "Candidate not found. Please re-upload the resume.", "suggestions": []}

        candidate_name = candidate.get('name', 'Unknown')
        display_name = "The Candidate" if req.anonymize else candidate_name

        # Build context from candidate data
        ctx = f"Name: {candidate_name}\nRole: {candidate.get('predicted_role', 'N/A')}\n"
        ctx += f"Experience: {candidate.get('total_experience_years', 'N/A')} years | Level: {candidate.get('experience_level', 'N/A')}\n"
        ctx += f"Location: {candidate.get('location', 'N/A')}\nSummary: {candidate.get('summary', 'N/A')}\n"
        skills = candidate.get('skills', [])
        ctx += f"Skills: {', '.join(str(s) for s in skills[:15])}\n"

        for exp in (candidate.get('work_experience') or [])[:8]:
            ctx += f"- {exp.get('title')} at {exp.get('company')} ({exp.get('start_date', '?')} - {exp.get('end_date', '?')})\n"

        resume_text = candidate.get('text', '') or candidate.get('raw_text', '')
        if resume_text and len(resume_text) > 3000:
            resume_text = resume_text[:3000]

        # Auto web search via Research Agent
        web_context = ""
        web_sources = []
        should_search = await research_agent.should_search(req.message, candidate_name)

        if should_search and not req.anonymize:
            search_result = await research_agent.search_for_chat(req.message, candidate_name)
            web_context = search_result.get("web_context", "")
            web_sources = search_result.get("sources", [])

        # Build scan data context
        scan_context = ""
        if req.scan_data:
            gh = req.scan_data.get("github")
            if gh:
                scan_context += f"\n🐙 GITHUB (@{gh.get('username', '')}):\n"
                scan_context += f"Repos: {gh.get('public_repos', 0)} | Followers: {gh.get('followers', 0)}\n"
                for repo in (gh.get('pinned_repos') or [])[:3]:
                    scan_context += f"  • {repo.get('name', '')} ({repo.get('language', '')}): {repo.get('description', '')}\n"

            li = req.scan_data.get("linkedin")
            if li and li.get("headline"):
                scan_context += f"\n💼 LINKEDIN: {li.get('name', '')} | {li.get('headline', '')}\n"
                if li.get("about"):
                    scan_context += f"About: {li['about'][:200]}\n"

        # Build system prompt
        system = f"""You are an expert resume analyst with access to multiple data sources.
Analyzing: {display_name}

RESUME DATA:
{ctx}

RESUME TEXT:
{resume_text}
{scan_context}
{f"WEB SEARCH DATA:{web_context}" if web_context else ""}

RULES:
1. Use ALL available data sources: resume, GitHub, LinkedIn, web search
2. Cross-reference data across sources
3. NEVER hallucinate — only use provided data
4. Cite sources: [Resume], [GitHub], [LinkedIn], [Web] when relevant
5. {"Use 'The Candidate' instead of real name." if req.anonymize else "Use real name."}

Respond helpfully with **bold** for key points."""

        if not openai_tool.llm:
            return {"response": "AI service not initialized.", "suggestions": []}

        from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
        msgs = [SystemMessage(content=system)]
        for m in req.conversation_history[-20:]:
            if m.get("role") == "user":
                msgs.append(HumanMessage(content=m["content"]))
            elif m.get("role") == "assistant":
                msgs.append(AIMessage(content=m["content"]))
        msgs.append(HumanMessage(content=req.message))

        response = await openai_tool.llm.ainvoke(msgs)
        ai_response = response.content

        # Anonymize
        if req.anonymize and candidate_name:
            for part in candidate_name.split():
                if len(part) > 2:
                    ai_response = re.sub(re.escape(part), "The Candidate", ai_response, flags=re.IGNORECASE)

        # Add sources
        if web_sources:
            ai_response += "\n\n---\n**🔍 Sources:**\n"
            for src in web_sources:
                if src["url"]:
                    ai_response += f"- [{src['title']}]({src['url']})\n"

        # Suggestions
        suggestions = []
        try:
            s_resp = await openai_tool.structured_call(
                f"Based on this conversation about {display_name}, suggest 3 short follow-up questions. One per line, no numbering.",
                "Suggest follow-up questions."
            )
            suggestions = [s.strip() for s in s_resp.strip().split('\n') if s.strip()][:3]
        except:
            pass

        return {"response": ai_response, "suggestions": suggestions}
    except Exception as e:
        print(f"Focus chat error: {e}")
        return {"response": f"**Error:** {str(e)}", "suggestions": []}

# ═══════ WEB SEARCH → Research Agent ═══════

@router.post("/web-search")
@limiter.limit("20/minute")
async def web_search(request: Request, req: WebSearchRequest, user=Depends(get_current_user)):
    """Web search powered by Research Agent"""
    result = await research_agent.standalone_search(req.query, req.candidate_id, req.candidate_name)
    return result

# ═══════ HIRING AGENT → HR Agent ═══════

@router.post("/hiring-agent")
@limiter.limit("10/minute")
async def hiring_agent(request: Request, req: HiringAgentRequest, user=Depends(get_current_user)):
    """Candidate evaluation powered by HR Agent"""
    try:
        candidate = _get_candidate(req.candidate_id, req.candidate_data, manager_id=user.id)
        if not candidate:
            return {"error": "Candidate not found."}

        result = await hr_agent.evaluate(
            candidate=candidate,
            role=req.role, level=req.level,
            experience=req.experience_required,
            job_description=req.job_description,
            anonymize=req.anonymize
        )
        return {"report": result.get("report", "Evaluation failed.")}
    except Exception as e:
        return {"error": str(e)}

# ═══════ EMAIL → HR Agent ═══════

@router.post("/draft-email")
async def draft_email(req: EmailDraftRequest, user=Depends(get_current_user)):
    """Email drafting powered by HR Agent"""
    try:
        candidate = _get_candidate(req.candidate_id, req.candidate_data, manager_id=user.id)
        if not candidate:
            return {"subject": "", "body": "Candidate not found."}

        result = await hr_agent.draft_email(candidate, req.email_type, req.evaluation_report, req.anonymize)
        return result
    except Exception as e:
        return {"subject": "Error", "body": str(e)}

# ═══════ GITHUB → Data Agent tools ═══════

@router.post("/github-analyze")
@limiter.limit("15/minute")
async def github_analyze(request: Request, req: GitHubRequest, user=Depends(get_current_user)):
    """GitHub analysis — multi-strategy with name validation"""
    try:
        candidate = _get_candidate(req.candidate_id, req.candidate_data, manager_id=user.id)
        username = req.github_username
        candidate_name = (candidate.get('name', '') if candidate else '') or ''

        if not username:
            # Strategy 0: Explicit URL passed from frontend (highest priority)
            if req.github_url:
                m = re.search(r'github\.com/([a-zA-Z0-9_-]+)', req.github_url)
                if m and m.group(1).lower() not in ('org', 'repos', 'issues', 'blob', 'tree', 'raw', 'wiki'):
                    username = m.group(1)

        if not username and candidate:
            # Strategy 1: Use PDF-embedded hyperlinks (most reliable — actual URLs in the PDF)
            embedded_links = candidate.get('embedded_links') or {}
            github_url = embedded_links.get('github_url', '')
            if github_url:
                m = re.search(r'github\.com/([a-zA-Z0-9_-]+)', github_url)
                if m and m.group(1).lower() not in ('org', 'repos', 'issues', 'blob', 'tree', 'raw', 'wiki'):
                    username = m.group(1)

            # Strategy 2: Text regex fallback
            if not username:
                text = candidate.get('text', '') or candidate.get('raw_text', '')
                from app.tools.pdf_tool import pdf_tool
                contact = pdf_tool.extract_contact_from_text(text)
                username = contact.get("github_username")

        if not username:
            return {"error": f"No GitHub profile found for {candidate_name or 'this candidate'}.", "needs_username": True}

        profile = await github_tool.call({"username": username})
        if profile.get("error"):
            return {"error": profile["error"]}

        # Validate: reject if profile name shares no words with candidate name (wrong person)
        profile_display = (profile.get("name") or "").lower()
        if candidate_name and profile_display:
            candidate_parts = set(candidate_name.lower().split())
            profile_parts   = set(profile_display.split())
            if not (candidate_parts & profile_parts):
                return {
                    "error": (
                        f"Found GitHub user '{profile.get('name')}' but that doesn't match "
                        f"'{candidate_name}'. The resume may reference someone else's GitHub. "
                        f"Ask the candidate for their correct GitHub username."
                    ),
                    "wrong_profile": True,
                    "found_name": profile.get("name"),
                    "expected_name": candidate_name,
                }

        # AI analysis
        if openai_tool.llm:
            analysis = await openai_tool.structured_call(
                f"Analyze this GitHub profile for hiring: {json.dumps(profile, default=str)[:600]}. "
                f"Candidate is {candidate_name}. 3-4 sentences on their technical activity.",
                "You are a technical recruiter. Be concise and specific."
            )
            profile["ai_analysis"] = analysis

        return {"profile": profile}
    except Exception as e:
        return {"error": str(e)}

# ═══════ SCANNER → Data Agent ═══════

@router.post("/scan-resume")
async def scan_resume(req: ScanRequest, user=Depends(get_current_user)):
    """Resume scanning powered by Data Agent"""
    try:
        candidate = _get_candidate(req.candidate_id, req.candidate_data, manager_id=user.id)
        if not candidate:
            return {"error": "Candidate not found", "logs": [], "profiles": {}}

        context = {
            "name": candidate.get("name", "Unknown"),
            "text": candidate.get("text", "") or candidate.get("raw_text", ""),
            "embedded_links": candidate.get("embedded_links", {}),
            "anonymize": req.anonymize,
        }

        result = await data_agent.run("Scan and enrich this candidate's profile", context)

        output = result.output if result.success else {}
        if not isinstance(output, dict):
            output = {}

        return {
            "logs": [{"step": l.step, "msg": l.msg, "status": l.status} for l in result.logs],
            "profiles": {
                "github": output.get("github"),
                "linkedin": output.get("linkedin"),
                "portfolio": output.get("portfolio"),
            },
            "ai_summary": output.get("ai_summary", ""),
            "contact": output.get("contact", {})
        }
    except Exception as e:
        print(f"Scanner error: {e}")
        return {"error": str(e), "logs": [], "profiles": {}}

# ═══════ CALENDLY ═══════

@router.get("/calendly-link")
async def get_calendly_link(user=Depends(get_current_user)):
    """Get Calendly scheduling links"""
    try:
        import httpx
        token = settings.calendly_token
        if not token:
            return {"error": "Calendly not configured", "event_types": [], "scheduling_url": ""}

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://api.calendly.com/users/me",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
            if resp.status_code != 200:
                return {"error": "Invalid Calendly token", "event_types": [], "scheduling_url": ""}

            user_data = resp.json().get("resource") or resp.json()
            user_uri = user_data.get("uri", "")
            scheduling_url = user_data.get("scheduling_url", "")

            events_resp = await client.get(f"https://api.calendly.com/event_types?user={user_uri}&active=true",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

            event_types = []
            if events_resp.status_code == 200:
                for ev in events_resp.json().get("collection", []):
                    event_types.append({"name": ev.get("name", "Meeting"), "duration": ev.get("duration", 30),
                        "scheduling_url": ev.get("scheduling_url", scheduling_url),
                        "description": (ev.get("description_plain") or "")[:100]})

            if not event_types and scheduling_url:
                event_types.append({"name": "Schedule a Meeting", "duration": 30, "scheduling_url": scheduling_url, "description": ""})

            return {"scheduling_url": scheduling_url, "event_types": event_types, "user_name": user_data.get("name", ""), "error": None}
    except Exception as e:
        return {"error": str(e), "event_types": [], "scheduling_url": ""}

# ═══════ INTERVIEW → Technical Agent ═══════

@router.post("/generate-interview-questions")
@limiter.limit("10/minute")
async def generate_interview_questions(request: Request, req: GenerateQuestionsRequest, user=Depends(get_current_user)):
    questions = await technical_agent.generate_questions(req.role, req.level, req.num_questions, req.focus_areas, req.candidate_name)
    return {"questions": questions}

# ═══════ RESUME INTELLIGENCE ═══════

class ResumeIntelRequest(BaseModel):
    candidate_id: int

class CredibilityRequest(BaseModel):
    candidate_id: int
    candidate_email: str

@router.post("/resume-intelligence")
async def resume_intelligence(req: ResumeIntelRequest, user=Depends(get_current_user)):
    """Analyze resume for gaps, unverified skills, and verification targets."""
    candidate = resume_rag.get_candidate(req.candidate_id, manager_id=user.id)
    if not candidate:
        raise HTTPException(404, "Candidate not found")
    intel = await technical_agent.analyze_resume_gaps(candidate)
    return {"intelligence": intel, "candidate_id": req.candidate_id}

@router.post("/smart-questions")
async def smart_questions(req: GenerateQuestionsRequest, user=Depends(get_current_user)):
    """Generate interview questions informed by resume gap analysis."""
    candidate_data = None
    # Try to find candidate by name within THIS manager's candidates only
    for c in resume_rag.get_all_candidates(manager_id=user.id):
        if c.get("name", "").lower() == (req.candidate_name or "").lower():
            candidate_data = c
            break
    result = await technical_agent.generate_smart_questions(
        req.role, req.level, req.num_questions, req.focus_areas, req.candidate_name, candidate_data
    )
    return result

@router.post("/credibility-analysis")
async def credibility_analysis(req: CredibilityRequest, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Cross-reference resume claims against interview performance."""
    candidate = resume_rag.get_candidate(req.candidate_id, manager_id=user.id)
    if not candidate:
        raise HTTPException(404, "Candidate not found in memory")

    interview = await db_service.get_interview_by_email(db, req.candidate_email, manager_id=user.id)
    if not interview or not interview.report:
        raise HTTPException(404, "No completed interview found for this candidate")

    report_data = interview.report
    if isinstance(report_data, str):
        try:
            report_data = json.loads(report_data)
        except:
            report_data = {"report": report_data}

    analysis = await technical_agent.analyze_credibility(candidate, report_data)
    return {"credibility": analysis, "candidate_id": req.candidate_id, "email": req.candidate_email}

class AutomateRankingRequest(BaseModel):
    role: str = ""
    candidate_ids: list = []

@router.post("/automate-ranking")
async def automate_ranking(req: AutomateRankingRequest, user=Depends(get_current_user)):
    """Rank this manager's uploaded candidates for a role — full automated analysis."""
    # Gather candidates from THIS manager's drawer only.
    drawer = {c["id"]: c for c in resume_rag.get_all_candidates(manager_id=user.id)}
    candidate_ids = req.candidate_ids or list(drawer.keys())
    candidates_data = []
    for cid in candidate_ids:
        c = drawer.get(cid)
        if c and c.get("is_resume", True):
            candidates_data.append(c)

    if len(candidates_data) == 0:
        raise HTTPException(400, "No candidates found to rank")

    target_role = req.role or "best matching role"

    # Build candidate summaries for comparison
    candidate_summaries = ""
    for i, c in enumerate(candidates_data):
        work = c.get("work_experience", [])
        work_str = ", ".join(f"{w.get('title','')} at {w.get('company','')}" for w in work[:3]) or "N/A"
        candidate_summaries += f"""
--- Candidate {i+1}: {c.get('name', 'Unknown')} (ID: {c.get('id', 0)}) ---
Role: {c.get('predicted_role', 'N/A')} | Level: {c.get('experience_level', 'N/A')} | Exp: {c.get('total_experience_years', 0)} years
Location: {c.get('location', 'N/A')}
Skills: {', '.join((c.get('skills') or [])[:12])}
Key Strengths: {', '.join((c.get('key_strengths') or [])[:4])}
Summary: {(c.get('summary') or 'N/A')[:200]}
Work History: {work_str}
Education: {', '.join(f"{e.get('degree','')} from {e.get('institution','')}" for e in (c.get('education') or [])[:2]) or 'N/A'}
"""

    prompt = f"""You are a senior hiring manager. Analyze and rank these {len(candidates_data)} candidates for the role: "{target_role}".

{candidate_summaries}

Provide a COMPREHENSIVE comparison and ranking. Return ONLY valid JSON:
{{
    "target_role": "{target_role}",
    "rankings": [
        {{
            "rank": 1,
            "candidate_id": <id>,
            "name": "name",
            "score": 0-100,
            "verdict": "Strong Fit / Good Fit / Potential Fit / Not a Fit",
            "strengths": ["why this candidate is good for the role"],
            "gaps": ["what they're missing"],
            "standout": "one sentence — what makes this person unique",
            "interview_priority": "High / Medium / Low",
            "suggested_focus_areas": ["what to probe in interview"]
        }}
    ],
    "comparison_summary": "2-3 sentences comparing the top candidates",
    "best_candidate": {{
        "name": "the top pick",
        "candidate_id": <id>,
        "reason": "why this person is the best fit"
    }},
    "interview_order": ["name1", "name2", "name3"],
    "role_insights": "any observations about the candidate pool for this role"
}}

RULES:
- Rank by ACTUAL fit for the role, not just experience years
- Skills match matters more than years of experience
- Consider growth potential for junior candidates
- Be specific — reference actual skills and experience from their data
- If role is generic, infer the best role from the candidate pool"""

    try:
        content = await openai_tool.structured_call(prompt, "You are an expert hiring manager who ranks candidates fairly based on role fit, skills, and potential.")
        content = content.strip()
        if '```' in content:
            for part in content.split('```'):
                part = part.strip()
                if part.startswith('json'): content = part[4:].strip(); break
                elif part.startswith('{'): content = part; break
        result = json.loads(content)
        return {"ranking": result, "total_candidates": len(candidates_data)}
    except Exception as e:
        print(f"⚠️ Automate ranking error: {e}")
        raise HTTPException(500, f"Ranking failed: {str(e)}")

@router.post("/score-answer")
async def score_answer(req: ScoreAnswerRequest, user=Depends(get_current_user)):
    return await technical_agent.score_answer(req.question, req.answer, req.role, req.candidate_name)

@router.post("/interview-report")
async def interview_report(req: InterviewReportRequest, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await technical_agent.generate_report(
        req.candidate_name, req.candidate_email, req.role,
        req.questions, req.answers, req.scores, req.duration
    )
    # Save to database (include transcript if provided)
    await db_service.save_interview_result(db, req.candidate_email, {
        "report": report, "scores": req.scores, "timer": req.duration,
        "transcript": req.transcript,
    })
    return {"report": report}


@router.post("/save-transcript")
async def save_transcript(
    req: SaveTranscriptRequest,
    db: AsyncSession = Depends(get_db),
    x_agent_token: Optional[str] = Header(default=None, alias="X-Agent-Token"),
):
    """Called by the interview worker to persist a transcript after the session ends.

    The worker is a service, not a browser session, so it can't use JWT. Instead it
    sends X-Agent-Token equal to settings.agent_shared_secret. The shared secret must
    be configured in both backend and worker env. Without it, anyone could overwrite
    interview transcripts by guessing an email.
    """
    expected = (settings.agent_shared_secret or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Agent shared secret not configured on server")
    if not x_agent_token or x_agent_token.strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Agent-Token")

    from sqlalchemy import select
    from app.models.candidate import Interview
    result = await db.execute(
        select(Interview)
        .where(Interview.candidate_email == req.candidate_email.strip().lower())
        .order_by(Interview.created_at.desc())
    )
    interview = result.scalars().first()
    if not (interview and req.transcript):
        return {"saved": False, "reason": "No interview record found or empty transcript"}

    interview.transcript = req.transcript

    # Auto-generate a lightweight report from the transcript so the hiring
    # manager has something to read immediately after the candidate disconnects.
    # The full per-question scoring path runs via /interview-report when the
    # frontend can provide question/answer pairs.
    try:
        joined = "\n".join(
            f"[{t.get('role', '?')}] {t.get('text', '')}" for t in (req.transcript or [])
        )[:8000]
        report_prompt = (
            f"You're reviewing a recorded interview transcript for {req.candidate_name} "
            f"applying for {req.role}. Produce a short hiring report in markdown:\n\n"
            "## Interview Summary (2-3 sentences)\n"
            "## Strengths (2-3 bullets, evidence-backed)\n"
            "## Concerns (2-3 bullets, kind tone)\n"
            "## Recommendation (Strong Hire / Hire / Consider / Pass)\n\n"
            f"Transcript:\n{joined}"
        )
        report_text = await openai_tool.structured_call(
            prompt=report_prompt,
            system="You are a senior hiring manager. Be concise, fair, and evidence-grounded.",
        )
        if report_text:
            interview.report = report_text
            interview.status = "completed"
    except Exception as exc:
        # Don't fail the transcript save if report generation hiccups.
        print(f"[save-transcript] report generation failed: {exc}")

    await db.commit()
    await _notify_manager_interview_complete(db, interview)
    return {"saved": True, "turns": len(req.transcript), "report_generated": bool(interview.report)}


async def _notify_manager_interview_complete(db, interview) -> None:
    """Best-effort email to the owning manager that an interview finished.

    Never raises into the caller — a notification failure must not fail the
    transcript save. No-op if the interview has no manager or no email is found.
    """
    try:
        if not interview or not interview.manager_id:
            return
        from app.models.auth import HiringManager
        from sqlalchemy import select as _select
        mgr = (await db.execute(
            _select(HiringManager).where(HiringManager.id == interview.manager_id)
        )).scalar_one_or_none()
        if not mgr or not mgr.email:
            return
        from app.services.email_service import email_service
        subject = f"Interview completed — {interview.candidate_email}"
        body = (
            f"<p>Hi {mgr.name or 'there'},</p>"
            f"<p><strong>{interview.candidate_email}</strong> just completed their "
            f"{interview.role or 'interview'}.</p>"
            f"<p>Log in to ResuMate to review the report.</p>"
        )
        await email_service.send(mgr.email, subject, body)
    except Exception as exc:
        print(f"[WARN] manager completion notification failed: {exc}")


# ═══════ CANDIDATE PORTAL (PostgreSQL-backed) ═══════

@router.post("/create-interview")
@limiter.limit("30/hour")
async def create_interview(request: Request, req: CreateInterviewRequest, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = req.candidate_email.strip().lower()
    mgr = user.id

    # Grant portal access (owned by this manager)
    await db_service.create_candidate_access(db, email, req.candidate_name or "", req.candidate_id, manager_id=mgr)

    # Create interview record (owned by this manager)
    interview = await db_service.create_interview(db, {
        "candidate_id": req.candidate_id,
        "manager_id": mgr,
        "candidate_email": email,
        "role": req.role or "General",
        "level": req.level or "Mid-Level",
        "experience_required": req.experience_required,
        "num_questions": req.num_questions,
        "focus_areas": req.focus_areas or [],
        "mode": (req.mode or "avatar").strip().lower(),
    })

    # Generate resume intelligence for smart interview questions
    resume_intel = None
    candidate = resume_rag.get_candidate(req.candidate_id, manager_id=mgr)
    if candidate:
        try:
            resume_intel = await technical_agent.analyze_resume_gaps(candidate)
            print(f"[OK] Resume intelligence generated: {len(resume_intel.get('verification_targets', []))} targets")
        except Exception as e:
            print(f"[WARN] Resume intel failed: {e}")

    config = {
        "candidate_id": req.candidate_id, "candidate_name": req.candidate_name or "",
        "role": req.role or "General", "level": req.level or "Mid-Level",
        "num_questions": req.num_questions, "focus_areas": req.focus_areas or [],
        "status": "pending",
        "resume_intelligence": resume_intel,
    }
    await db_service.log_event(
        db, action="interview.create", actor="manager",
        manager_id=mgr, target_email=email,
        detail=f"role={req.role or 'General'} mode={(req.mode or 'avatar')}",
    )
    print(f"[OK] Interview created for {email}")
    return {"message": f"Interview created for {email}", "interview_config": config}

@router.post("/verify-email")
@limiter.limit("10/minute")
async def verify_email(request: Request, req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Pre-auth existence check ONLY — does this email have portal access?

    SECURITY: this endpoint is unauthenticated by necessity (the candidate has no
    token yet), so it must never return personal data. An email address is not a
    secret; it is enumerable and frequently public. This route previously
    returned the candidate's name, candidate_id, interview config, and the FULL
    interview report + transcript to anyone who posted a known address.

    It now returns a bare boolean. The candidate proves possession of the address
    via the OTP flow (POST /api/auth/candidate/send-otp -> verify-otp), and every
    piece of real data is served from token-authenticated routes:
      - GET /api/chat/candidate/me         -> profile + pending interview config
      - GET /api/chat/candidate/my-report  -> completed report + transcript
    """
    email = req.email.strip().lower()

    access = await db_service.get_candidate_access(db, email)
    if access:
        return {"access": True}

    # Fallback: the candidate may have been uploaded by a manager but never
    # explicitly granted portal access. Scan resume texts and auto-grant under the
    # OWNING manager. This is deliberately cross-tenant — the candidate is the
    # data subject. We grant ACCESS here but still return no data.
    for c in resume_rag.iter_all_candidates():
        text = (c.get('text', '') or c.get('raw_text', '') or '').lower()
        emb_email = (c.get('embedded_links', {}) or {}).get('email', '') or ''
        if email in text or email == emb_email.lower():
            owner = c.get('manager_id') or None
            await db_service.create_candidate_access(db, email, c.get('name', ''), c.get('id'), manager_id=owner)
            return {"access": True}

    return {"access": False, "message": "No access found for this email. Please contact your hiring manager."}


@router.get("/candidate/me")
async def candidate_me(
    candidate_email: str = Depends(get_current_candidate),
    db: AsyncSession = Depends(get_db),
):
    """Authenticated replacement for the data /verify-email used to hand out.

    Identity comes from the candidate's own session token, so a candidate can
    only ever read their own profile and pending interview.
    """
    access = await db_service.get_candidate_access(db, candidate_email)
    if not access:
        raise HTTPException(404, "No access found for this email")

    interview = await db_service.get_interview_by_email(db, candidate_email)
    has_iv = interview is not None
    completed = has_iv and interview.status == "completed"

    iv_config = None
    if interview and not completed:
        iv_config = {
            "role": interview.role, "level": interview.level,
            "num_questions": interview.num_questions,
            "focus_areas": interview.focus_areas or [],
            "status": interview.status,
            "mode": interview.mode or "avatar",
            "interview_id": interview.id,
        }

    return {
        "access": True,
        "name": access.name or "",
        "candidate_id": access.candidate_id,
        "has_interview": has_iv and not completed,
        "interview_config": iv_config,
        "interview_completed": completed,
    }


@router.get("/candidate/my-report")
async def candidate_my_report(
    candidate_email: str = Depends(get_current_candidate),
    db: AsyncSession = Depends(get_db),
):
    """A candidate's own completed interview report + transcript (token-scoped)."""
    interview = await db_service.get_interview_by_email(db, candidate_email)
    if not interview or interview.status != "completed" or not interview.report:
        raise HTTPException(404, "No completed interview report found")

    try:
        report = json.loads(interview.report) if isinstance(interview.report, str) else interview.report
    except (ValueError, TypeError):
        report = {"report": interview.report}
    if interview.transcript and isinstance(report, dict):
        report["transcript"] = interview.transcript

    return {"interview_completed": True, "interview_report": report}

@router.get("/interview-status/{email}")
async def interview_status(email: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = email.strip().lower()
    interview = await db_service.get_interview_by_email(db, email, manager_id=user.id)
    if interview:
        return {
            "exists": True,
            "status": interview.status,
            "completed": interview.status == "completed",
            "mode": interview.mode or "avatar",
            "interview_id": interview.id,
            "config": {
                "role": interview.role, "level": interview.level,
                "num_questions": interview.num_questions,
                "mode": interview.mode or "avatar",
                "interview_id": interview.id,
            }
        }
    return {"exists": False}

# ═══════ INTERVIEW RESULTS (PostgreSQL-backed) ═══════

class SaveInterviewResult(BaseModel):
    candidate_email: str
    candidate_name: Optional[str] = None
    report: dict

@router.post("/save-interview-result")
async def save_interview_result(
    req: SaveInterviewResult,
    db: AsyncSession = Depends(get_db),
    candidate_email: str = Depends(get_current_candidate),
):
    """Save an interview result, posted by the candidate's browser after the session.

    Requires the candidate's session token and writes to THAT email — the body
    field is ignored. Previously this was fully unauthenticated, so anyone could
    overwrite any candidate's interview report by guessing their address.
    """
    await db_service.save_interview_result(db, candidate_email, req.report)
    return {"status": "saved"}


@router.post("/candidate/delete-my-data")
@limiter.limit("3/hour")
async def candidate_delete_my_data(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    """GDPR erasure — a candidate deletes ALL their own data.

    Authenticated by the candidate's own session token (type=candidate, sub=email)
    issued at OTP login. Removes interviews, portal access, the in-memory +
    ChromaDB candidate record, and the stored resume file (object storage), then
    writes an audit record.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Candidate session token required")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token)  # raises 401 if invalid/expired
    if payload.get("type") != "candidate":
        raise HTTPException(403, "This endpoint is for candidate sessions only")
    email = (payload.get("sub") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Token has no email subject")

    from sqlalchemy import delete as sql_delete, select as sql_select
    from app.models.candidate import Interview, CandidateAccess, Candidate

    # Find DB candidate rows for this email (to clean memory/Chroma/object store).
    cand_rows = (await db.execute(
        sql_select(Candidate).where(Candidate.email == email)
    )).scalars().all()

    # Remove from the in-memory store + ChromaDB + object storage, scoped to the
    # row's owning manager so we hit the right drawer.
    for row in cand_rows:
        try:
            resume_rag.delete_candidate(row.id, manager_id=row.manager_id)
        except Exception as exc:
            print(f"[WARN] in-memory delete failed for candidate {row.id}: {exc}")
        # Object storage (no-op if S3 unconfigured).
        try:
            from app.services.storage_service import storage_service
            if getattr(row, "file_object_key", None):
                storage_service.delete(row.file_object_key)
        except Exception as exc:
            print(f"[WARN] object-store delete failed: {exc}")

    # Delete DB rows: interviews, access grants, candidates (by email).
    await db.execute(sql_delete(Interview).where(Interview.candidate_email == email))
    await db.execute(sql_delete(CandidateAccess).where(CandidateAccess.email == email))
    await db.execute(sql_delete(Candidate).where(Candidate.email == email))
    await db.commit()

    await db_service.log_event(
        db, action="candidate.delete", actor="candidate", target_email=email,
        detail=f"candidate-initiated erasure of {len(cand_rows)} record(s)",
    )
    return {"status": "deleted", "email": email, "records_removed": len(cand_rows)}

@router.get("/get-interview-results/{email}")
async def get_interview_results(email: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get interview results for one of this manager's candidates."""
    email = email.strip().lower()
    interview = await db_service.get_interview_by_email(db, email, manager_id=user.id)
    if interview and interview.report:
        report = interview.report
        try:
            report = json.loads(report) if isinstance(report, str) else report
        except:
            pass
        return {"email": email, "results": [{"report": report, "timestamp": interview.completed_at.isoformat() if interview.completed_at else None}], "count": 1}
    return {"email": email, "results": [], "count": 0}

@router.get("/get-all-interview-results")
async def get_all_interview_results(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get this manager's completed interview results (for their dashboard)."""
    results = await db_service.get_all_completed_interviews(db, manager_id=user.id)
    return {"results": results, "count": len(results)}


@router.get("/interview-statuses")
async def interview_statuses(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Compact email -> {status, mode, id} map for the ATS results badges.

    Scoped to this manager's interviews only. Lighter than
    get-all-interview-results (no report bodies, no transcripts). Used by
    ATSResultsView to render Pending / In progress / Completed badges.
    """
    from sqlalchemy import select
    from app.models.candidate import Interview
    rows = (await db.execute(
        select(
            Interview.candidate_email,
            Interview.status,
            Interview.mode,
            Interview.id,
        )
        .where(Interview.manager_id == user.id)
        .order_by(Interview.created_at.desc())
    )).all()
    # Latest interview per email wins (rows are ordered desc by created_at).
    out: dict = {}
    for email, status, mode, iv_id in rows:
        key = (email or "").lower()
        if key and key not in out:
            out[key] = {"status": status, "mode": mode or "avatar", "id": iv_id}
    return {"statuses": out, "count": len(out)}

# ═══════ PDF REPORT EXPORT ═══════

@router.get("/export-report/{email}")
async def export_report_pdf(email: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Generate a branded PDF report for one of THIS manager's candidates.

    Auth + ownership required — previously this was public and any email could
    be guessed to download a candidate's full report (resume + interview).
    """
    from fpdf import FPDF
    import re as re_mod

    email = email.strip().lower()
    interview = await db_service.get_interview_by_email(db, email, manager_id=user.id)

    # Find candidate data within THIS manager's drawer only.
    candidate = None
    for c in resume_rag.get_all_candidates(manager_id=user.id):
        emb_email = (c.get('embedded_links', {}) or {}).get('email', '') or ''
        if email in (c.get('text', '') or '').lower() or email == emb_email.lower():
            candidate = c
            break

    if not interview and not candidate:
        raise HTTPException(404, "No data found for this email")

    # Parse interview report
    report_data = {}
    if interview and interview.report:
        try:
            report_data = json.loads(interview.report) if isinstance(interview.report, str) else interview.report
        except:
            report_data = {"report": interview.report}

    # Build PDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Header
    pdf.set_fill_color(59, 130, 246)
    pdf.rect(0, 0, 210, 40, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_y(10)
    pdf.cell(0, 10, "ResuMate Pro", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, "Candidate Assessment Report", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(10)

    def section_title(title):
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(59, 130, 246)
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(59, 130, 246)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(4)
        pdf.set_text_color(40, 40, 40)

    def body_text(text):
        pdf.set_font("Helvetica", "", 10)
        # Clean markdown
        text = re_mod.sub(r'\*\*(.*?)\*\*', r'\1', text)
        text = re_mod.sub(r'#{1,3}\s*', '', text)
        text = text.replace('- ', '  * ')
        for line in text.split('\n'):
            line = line.strip()
            if line:
                pdf.multi_cell(0, 5, line)
                pdf.ln(1)

    # Candidate Info
    if candidate:
        section_title("Candidate Profile")
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 7, candidate.get("name", "Unknown"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        info_lines = []
        if candidate.get("predicted_role"): info_lines.append(f"Role: {candidate['predicted_role']}")
        if candidate.get("experience_level"): info_lines.append(f"Level: {candidate['experience_level']}")
        if candidate.get("total_experience_years"): info_lines.append(f"Experience: {candidate['total_experience_years']} years")
        if candidate.get("location"): info_lines.append(f"Location: {candidate['location']}")
        pdf.cell(0, 6, "  |  ".join(info_lines), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        if candidate.get("summary"):
            pdf.set_font("Helvetica", "I", 10)
            pdf.multi_cell(0, 5, candidate["summary"])
            pdf.ln(3)

        if candidate.get("skills"):
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 6, "Skills:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 9)
            pdf.multi_cell(0, 5, ", ".join(candidate["skills"][:20]))
            pdf.ln(3)

        if candidate.get("work_experience"):
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 6, "Work Experience:", new_x="LMARGIN", new_y="NEXT")
            for w in candidate["work_experience"][:5]:
                pdf.set_font("Helvetica", "B", 9)
                pdf.cell(0, 5, f"{w.get('title', '')} at {w.get('company', '')}", new_x="LMARGIN", new_y="NEXT")
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(0, 5, f"{w.get('start_date', '?')} - {w.get('end_date', '?')} ({w.get('duration_months', 0)} months)", new_x="LMARGIN", new_y="NEXT")
                pdf.ln(1)
            pdf.ln(2)

    # Interview Results
    if interview and interview.status == "completed":
        section_title("Interview Results")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 6, f"Role: {interview.role or 'General'}  |  Level: {interview.level or 'Mid-Level'}  |  Status: Completed", new_x="LMARGIN", new_y="NEXT")

        scores = report_data.get("scores", [])
        avg = report_data.get("avgScore", 0)
        if not avg and scores:
            avg = sum(s.get("score", 0) for s in scores if isinstance(s, dict)) / max(len(scores), 1)

        dur = report_data.get("timer", interview.duration or 0)
        eye = report_data.get("eyeContact", 0)
        viol = report_data.get("violations", 0)

        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 10)
        stats = f"Avg Score: {avg:.1f}/10  |  Eye Contact: {eye}%  |  Violations: {viol}  |  Duration: {dur // 60}m {dur % 60}s"
        pdf.cell(0, 6, stats, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        # Score breakdown
        if scores:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 6, "Score Breakdown:", new_x="LMARGIN", new_y="NEXT")
            for i, s in enumerate(scores):
                if isinstance(s, dict):
                    sc = s.get("score", 0)
                    fb = s.get("feedback", "")
                    pdf.set_font("Helvetica", "", 9)
                    pdf.cell(0, 5, f"  Q{i+1}: {sc}/10 - {fb}", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(3)

        # Report text
        report_text = report_data.get("report", "")
        if report_text and isinstance(report_text, str) and len(report_text) > 5:
            section_title("AI Evaluation")
            body_text(report_text)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated by ResuMate Pro | {datetime.utcnow().strftime('%B %d, %Y')}", align="C")

    # Return PDF
    pdf_bytes = pdf.output()
    name = (candidate or {}).get("name", email).replace(" ", "-")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="ResuMate-Report-{name}.pdf"'}
    )
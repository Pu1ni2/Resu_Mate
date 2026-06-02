"""
ResuMate AI — Advisor Agent (Candidate-facing)

3 Sub-agents:
1. Resume Coach — Reviews resume, suggests improvements, identifies gaps
2. Interview Prep — Generates practice questions, tips, mock answers
3. Career Advisor — Career path suggestions, strengths/weaknesses, market insights

Add to your existing backend: from app.agents.advisor_agent import advisor_router
Then: app.include_router(advisor_router, prefix="/api")
"""
import os
import json
from fastapi import APIRouter, UploadFile, File, Form, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.services import state_service

limiter = Limiter(key_func=get_remote_address)

try:
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
except ImportError:
    print("⚠️ openai package not installed — advisor agent chat will not work")
    client = None

router = APIRouter(prefix="/advisor", tags=["advisor"])

# In-memory cache (warm path — avoids DB hit for same-request-cycle access)
_session_cache = {}


# ═══ RESUME UPLOAD FOR CANDIDATES ═══
@router.post("/upload-resume")
@limiter.limit("10/hour")
async def candidate_upload_resume(
    request: Request,
    file: UploadFile = File(...),
    email: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    """Upload resume from candidate side — no auth required"""
    import hashlib
    content = await file.read()
    text = ""

    if file.filename.endswith('.pdf'):
        try:
            import PyPDF2
            import io
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            text = content.decode('utf-8', errors='ignore')
    elif file.filename.endswith('.docx'):
        try:
            import docx
            import io
            doc = docx.Document(io.BytesIO(content))
            text = "\n".join(p.text for p in doc.paragraphs)
        except Exception:
            text = content.decode('utf-8', errors='ignore')
    else:
        text = content.decode('utf-8', errors='ignore')

    cid = hashlib.md5(f"{email}-{file.filename}".encode()).hexdigest()[:12]
    metadata = {
        "id": cid,
        "name": email.split("@")[0].title(),
        "filename": file.filename,
        "email": email,
    }

    # Quick analysis
    try:
        analysis = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "system",
                "content": "Analyze this resume and return JSON with: name, predicted_role, experience_level (Entry/Mid/Senior/Lead), total_experience_years (number), skills (array of strings), summary (2 sentences), location"
            }, {
                "role": "user",
                "content": f"Resume:\n{text[:4000]}"
            }],
            response_format={"type": "json_object"},
            max_tokens=500,
        )
        metadata.update(json.loads(analysis.choices[0].message.content))
    except Exception as e:
        print(f"Analysis failed: {e}")
        metadata.update({"predicted_role": "Professional", "experience_level": "Mid", "skills": [], "summary": "Resume uploaded."})

    # Persist to DB
    await state_service.update_advisor_session(db, email, resume_text=text[:8000], resume_metadata=metadata)
    _session_cache[email] = {"text": text[:8000], **metadata}

    return {"success": True, "data": metadata}


# ═══ SUB-AGENT SYSTEM PROMPTS ═══
RESUME_COACH_PROMPT = """You are an expert Resume Coach. Your role is to help candidates improve their resumes.

Given the candidate's resume, you:
- Identify strengths in their resume
- Point out missing sections or weak areas
- Suggest specific improvements with examples
- Recommend better phrasing and power verbs
- Check for ATS (Applicant Tracking System) optimization
- Suggest quantifiable metrics they should add
- Compare against industry best practices

Be encouraging but honest. Give specific, actionable advice.
Keep responses concise and structured."""

INTERVIEW_PREP_PROMPT = """You are an expert Interview Preparation Coach. Your role is to help candidates prepare for job interviews.

IMPORTANT: Before giving generic advice, ASK the candidate about their specific situation:
- What role are they interviewing for?
- What company or industry?
- What type of interview (technical, behavioral, system design, HR)?
- What round (phone screen, onsite, final)?
- Any specific concerns or areas they want to focus on?

If the candidate gives vague requests like "help me prepare", ask 1-2 clarifying questions first.
Format your clarifying questions as clear options when possible, like:
"What type of interview are you preparing for?
- Technical coding interview
- System design interview  
- Behavioral/HR interview
- Case study interview"

Once you have context, provide:
- Realistic interview questions tailored to their specific role and company
- Tips on how to answer using the STAR method for behavioral questions
- Help crafting their "tell me about yourself" pitch
- Questions they should ask the interviewer
- Mock interview scenarios with feedback
- Body language and presentation tips
- Salary negotiation preparation

Be practical and supportive. Give example answers when asked.
Keep responses focused and actionable."""

CAREER_ADVISOR_PROMPT = """You are an expert Career Advisor. Your role is to help candidates with career strategy and growth.

Given the candidate's resume and background, you:
- Analyze their strengths and areas for improvement
- Suggest career paths that match their skills
- Recommend skills to learn for career growth
- Provide industry insights and market trends
- Help identify transferable skills
- Suggest certifications or courses
- Compare their profile against market expectations
- Give honest assessment of their competitiveness

Be strategic and forward-thinking. Provide both short-term and long-term advice.
Keep responses insightful and personalized."""


class AdvisorChatRequest(BaseModel):
    email: str
    message: str
    mode: str = "general"  # resume_coach | interview_prep | career_advisor | general
    session_id: Optional[str] = None


@router.post("/chat")
@limiter.limit("30/minute")
async def advisor_chat(request: Request, req: AdvisorChatRequest, db: AsyncSession = Depends(get_db)):
    """Chat with the Advisor Agent — routes to appropriate sub-agent (DB-backed sessions)"""

    # Load session from cache or DB
    cached = _session_cache.get(req.email)
    if not cached:
        session = await state_service.get_or_create_advisor_session(db, req.email)
        cached = {"text": session.resume_text or "", **(session.resume_metadata or {})}
        _session_cache[req.email] = cached

    resume_text = cached.get("text", "No resume uploaded yet.")
    candidate_name = cached.get("name", req.email.split("@")[0].title())

    # Fallback: try hiring manager resume store
    if not resume_text or resume_text == "No resume uploaded yet.":
        try:
            from app.api.chat import resume_rag
            for cid, c in resume_rag.candidates.items():
                c_text = (c.get('text', '') or c.get('raw_text', '') or '').lower()
                if req.email.lower() in c_text:
                    resume_text = c.get('text', '') or c.get('raw_text', '')[:8000]
                    candidate_name = c.get('name', candidate_name)
                    break
        except Exception:
            pass

    mode_prompts = {
        "resume_coach": RESUME_COACH_PROMPT,
        "interview_prep": INTERVIEW_PREP_PROMPT,
        "career_advisor": CAREER_ADVISOR_PROMPT,
        "general": f"You are a friendly AI Career Assistant for {candidate_name}. Help with resume review, interview preparation, and career advice. Be warm, encouraging, and practical.",
    }

    system_prompt = mode_prompts.get(req.mode, mode_prompts["general"])
    system_prompt += f"\n\nCandidate: {candidate_name}\nResume Context:\n{resume_text[:4000]}"

    # Load chat history for this mode from DB
    session = await state_service.get_or_create_advisor_session(db, req.email)
    history = list(session.chat_history.get(req.mode, []) if session.chat_history else [])
    history.append({"role": "user", "content": req.message})

    messages = [{"role": "system", "content": system_prompt}] + history[-20:]

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=1000,
            temperature=0.7,
        )
        reply = response.choices[0].message.content
        history.append({"role": "assistant", "content": reply})

        # Persist updated history to DB
        await state_service.update_advisor_session(db, req.email, mode=req.mode, messages=history)

        suggestions = get_suggestions(req.mode, len(history), reply)
        return {"reply": reply, "mode": req.mode, "suggestions": suggestions}
    except Exception as e:
        return {"reply": f"Sorry, I encountered an error: {str(e)}", "mode": req.mode, "suggestions": ["Try again", "Ask something else"]}


def get_suggestions(mode: str, history_len: int, last_reply: str = "") -> List[str]:
    """Context-aware suggestions — always provide follow-ups"""
    if history_len <= 2:
        return {
            "resume_coach": [
                "Review my resume and highlight weak areas",
                "How can I optimize for ATS?",
                "Suggest stronger bullet points",
            ],
            "interview_prep": [
                "What role am I preparing for?",
                "Generate 5 practice questions",
                "Help me with behavioral questions",
            ],
            "career_advisor": [
                "Analyze my strengths and weaknesses",
                "What career paths fit my profile?",
                "What skills are in-demand for my field?",
            ],
            "general": [
                "Review my resume",
                "Help me prepare for interviews",
                "Give me career advice",
            ],
        }.get(mode, [])
    
    # Dynamic follow-ups based on conversation stage
    follow_ups = {
        "resume_coach": [
            "What about the format and layout?",
            "How does it compare to top resumes?",
            "Help me rewrite the summary section",
        ],
        "interview_prep": [
            "Give me a harder question",
            "How should I handle salary negotiation?",
            "What questions should I ask them?",
        ],
        "career_advisor": [
            "What certifications would help?",
            "How's the job market for my role?",
            "What should I focus on in the next 6 months?",
        ],
        "general": [
            "Tell me more",
            "What else should I improve?",
            "Can you be more specific?",
        ],
    }
    return follow_ups.get(mode, ["Tell me more", "What else?", "Can you elaborate?"])


@router.get("/context/{email}")
async def get_candidate_context(email: str, db: AsyncSession = Depends(get_db)):
    """Get candidate context for the advisor — DB-backed"""
    session = await state_service.get_or_create_advisor_session(db, email)
    if session.resume_text:
        meta = session.resume_metadata or {}
        return {"found": True, **{k: v for k, v in meta.items() if k != 'text'}}

    # Fallback: hiring manager uploads
    try:
        from app.api.chat import resume_rag
        for cid, c in resume_rag.candidates.items():
            c_text = (c.get('text', '') or c.get('raw_text', '') or '').lower()
            if email.lower() in c_text:
                return {"found": True, "name": c.get('name', ''), "role": c.get('predicted_role', ''), "skills": c.get('skills', [])}
    except Exception:
        pass

    return {"found": False}
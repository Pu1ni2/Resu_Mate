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
from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
try:
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
except ImportError:
    print("⚠️ openai package not installed — advisor agent chat will not work")
    client = None

router = APIRouter(prefix="/advisor", tags=["advisor"])

# Store candidate contexts (resume text per email)
candidate_contexts = {}
# Store chat histories per session
advisor_chat_histories = {}


# ═══ RESUME UPLOAD FOR CANDIDATES ═══
@router.post("/upload-resume")
async def candidate_upload_resume(
    file: UploadFile = File(...),
    email: str = Form("")
):
    """Upload resume from candidate side — no auth required"""
    import hashlib
    content = await file.read()
    text = ""
    
    # Extract text — try packages if available, fallback to raw decode
    if file.filename.endswith('.pdf'):
        try:
            import PyPDF2
            import io
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            # PyPDF2 not installed — try raw decode
            text = content.decode('utf-8', errors='ignore')
            # Clean up binary PDF artifacts
            text = ''.join(c for c in text if c.isprintable() or c in '\n\r\t')
        except Exception as e:
            text = content.decode('utf-8', errors='ignore')
    elif file.filename.endswith('.docx'):
        try:
            import docx
            import io
            doc = docx.Document(io.BytesIO(content))
            text = "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            text = content.decode('utf-8', errors='ignore')
        except Exception:
            text = content.decode('utf-8', errors='ignore')
    else:
        text = content.decode('utf-8', errors='ignore')
    
    # Store context
    cid = hashlib.md5(f"{email}-{file.filename}".encode()).hexdigest()[:12]
    candidate_contexts[email] = {
        "id": cid,
        "name": email.split("@")[0].title(),
        "filename": file.filename,
        "text": text[:8000],  # Limit for context window
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
        data = json.loads(analysis.choices[0].message.content)
        candidate_contexts[email].update(data)
    except Exception as e:
        print(f"Analysis failed: {e}")
        candidate_contexts[email].update({
            "predicted_role": "Professional",
            "experience_level": "Mid",
            "skills": [],
            "summary": "Resume uploaded successfully."
        })
    
    return {
        "success": True,
        "data": candidate_contexts[email]
    }


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

Given the candidate's resume and background, you:
- Generate realistic interview questions for their target role
- Provide tips on how to answer behavioral questions (STAR method)
- Help them prepare their "tell me about yourself" pitch
- Suggest questions they should ask the interviewer
- Provide mock interview scenarios
- Coach on body language and presentation tips
- Help with salary negotiation preparation

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
async def advisor_chat(req: AdvisorChatRequest):
    """Chat with the Advisor Agent — routes to appropriate sub-agent"""
    
    # Get candidate context
    context = candidate_contexts.get(req.email, {})
    resume_text = context.get("text", "No resume uploaded yet.")
    candidate_name = context.get("name", "Candidate")
    
    # Also check if resume was uploaded by hiring manager
    if not context:
        try:
            from app.api.chat import resume_rag
            for cid, c in resume_rag.candidates.items():
                c_text = (c.get('text', '') or c.get('raw_text', '') or '').lower()
                if req.email.lower() in c_text:
                    resume_text = c.get('text', '') or c.get('raw_text', '')[:8000]
                    candidate_name = c.get('name', 'Candidate')
                    break
        except:
            pass
    
    # Pick system prompt based on mode
    mode_prompts = {
        "resume_coach": RESUME_COACH_PROMPT,
        "interview_prep": INTERVIEW_PREP_PROMPT,
        "career_advisor": CAREER_ADVISOR_PROMPT,
        "general": f"""You are a friendly AI Career Assistant for {candidate_name}. 
You can help with resume review, interview preparation, and career advice.
If the user asks about their resume, act as a Resume Coach.
If they ask about interviews, act as an Interview Prep Coach.
If they ask about career growth, act as a Career Advisor.
Be warm, encouraging, and practical."""
    }
    
    system_prompt = mode_prompts.get(req.mode, mode_prompts["general"])
    system_prompt += f"\n\nCandidate: {candidate_name}\nResume Context:\n{resume_text[:4000]}"
    
    # Get/create chat history
    sid = req.session_id or f"{req.email}-{req.mode}"
    if sid not in advisor_chat_histories:
        advisor_chat_histories[sid] = []
    
    history = advisor_chat_histories[sid]
    history.append({"role": "user", "content": req.message})
    
    # Build messages
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-20:])  # Last 20 messages
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=1000,
            temperature=0.7,
        )
        reply = response.choices[0].message.content
        history.append({"role": "assistant", "content": reply})
        
        # Generate suggestions based on mode
        suggestions = get_suggestions(req.mode, len(history))
        
        return {
            "reply": reply,
            "mode": req.mode,
            "suggestions": suggestions,
        }
    except Exception as e:
        return {"reply": f"Sorry, I encountered an error: {str(e)}", "mode": req.mode, "suggestions": []}


def get_suggestions(mode: str, history_len: int) -> List[str]:
    """Context-aware suggestions based on mode and conversation progress"""
    if history_len <= 2:
        # First message suggestions
        return {
            "resume_coach": [
                "Review my resume and give feedback",
                "What's missing from my resume?",
                "How can I make it ATS-friendly?",
            ],
            "interview_prep": [
                "Generate practice questions for my role",
                "Help me with 'Tell me about yourself'",
                "What behavioral questions should I expect?",
            ],
            "career_advisor": [
                "What are my key strengths?",
                "What career paths fit my profile?",
                "What skills should I learn next?",
            ],
            "general": [
                "Review my resume",
                "Help me prepare for interviews",
                "What career advice do you have?",
            ],
        }.get(mode, [])
    else:
        # Follow-up suggestions
        return {
            "resume_coach": ["Suggest better bullet points", "Check for grammar issues", "How does it compare to top resumes?"],
            "interview_prep": ["Give me a mock interview", "How should I handle tough questions?", "Tips for virtual interviews"],
            "career_advisor": ["Recommend certifications", "What's the job market like?", "How to negotiate salary?"],
            "general": ["Tell me more", "What else should I improve?", "Any other tips?"],
        }.get(mode, [])


@router.get("/context/{email}")
async def get_candidate_context(email: str):
    """Get candidate context for the advisor"""
    ctx = candidate_contexts.get(email, {})
    if not ctx:
        # Try to find from hiring manager uploads
        try:
            from app.api.chat import resume_rag
            for cid, c in resume_rag.candidates.items():
                c_text = (c.get('text', '') or c.get('raw_text', '') or '').lower()
                if email.lower() in c_text:
                    return {"found": True, "name": c.get('name', ''), "role": c.get('predicted_role', ''), "skills": c.get('skills', [])}
        except:
            pass
        return {"found": False}
    return {"found": True, **{k: v for k, v in ctx.items() if k != 'text'}}
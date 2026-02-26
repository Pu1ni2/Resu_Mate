"""Chat API with Voice Support and Anonymization - FIXED"""
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import io

from app.services.auth import get_current_user
from app.services.resume_rag import resume_rag
from app.core.config import settings

router = APIRouter(prefix="/chat", tags=["Chat"])

# Chat histories
chat_histories = {
    "default": [],
    "default_anon": []
}


class ChatRequest(BaseModel):
    message: str
    candidate_ids: List[int] = []
    conversation_id: Optional[str] = "default"
    anonymize: bool = False


class ChatResponse(BaseModel):
    response: str
    suggestions: List[str]
    conversation_id: str


class TTSRequest(BaseModel):
    text: str
    voice: str = "nova"


@router.post("/send", response_model=ChatResponse)
async def send_message(req: ChatRequest, user=Depends(get_current_user)):
    """Send a message to AI assistant"""
    conv_id = f"{req.conversation_id}_anon" if req.anonymize else req.conversation_id
    
    if conv_id not in chat_histories:
        chat_histories[conv_id] = []
    
    history = chat_histories[conv_id]
    
    try:
        result = await resume_rag.chat(
            message=req.message,
            candidate_ids=req.candidate_ids,
            conversation_history=history,
            anonymize=req.anonymize
        )
        
        history.append({"role": "user", "content": req.message})
        history.append({"role": "assistant", "content": result["response"]})
        chat_histories[conv_id] = history[-20:]
        
        return ChatResponse(
            response=result["response"],
            suggestions=result.get("suggestions", []),
            conversation_id=conv_id
        )
        
    except Exception as e:
        raise HTTPException(500, f"Chat error: {str(e)}")


@router.get("/intro")
async def get_intro(candidate_count: int = 0, anonymize: bool = False, user=Depends(get_current_user)):
    """Get intro message"""
    return resume_rag.get_intro_message(candidate_count, anonymize)


@router.delete("/clear")
async def clear_chat(anonymize: bool = False, user=Depends(get_current_user)):
    """Clear chat history"""
    for key in list(chat_histories.keys()):
        chat_histories[key] = []
    return {"message": "Chat history cleared"}


# ============ VOICE FEATURES ============

@router.post("/speech-to-text")
async def speech_to_text(audio: UploadFile = File(...), user=Depends(get_current_user)):
    """Convert speech to text using OpenAI Whisper"""
    
    # Check API key
    if not settings.openai_api_key:
        return JSONResponse(
            status_code=500,
            content={"error": "OpenAI API key not configured", "text": ""}
        )
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)
        
        # Read audio content
        audio_content = await audio.read()
        
        if len(audio_content) == 0:
            return JSONResponse(
                status_code=400,
                content={"error": "Empty audio file", "text": ""}
            )
        
        # Create file-like object
        audio_file = io.BytesIO(audio_content)
        audio_file.name = audio.filename or "audio.webm"
        
        # Transcribe
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text"
        )
        
        return {"text": transcription, "error": None}
        
    except Exception as e:
        print(f"Speech-to-text error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "text": ""}
        )


@router.post("/text-to-speech")
async def text_to_speech(req: TTSRequest, user=Depends(get_current_user)):
    """Convert text to speech using OpenAI TTS"""
    
    # Check API key
    if not settings.openai_api_key:
        raise HTTPException(500, "OpenAI API key not configured")
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)
        
        # Clean text
        clean_text = req.text
        clean_text = clean_text.replace("**", "")
        clean_text = clean_text.replace("*", "")
        clean_text = clean_text.replace("#", "")
        clean_text = clean_text.replace("`", "")
        clean_text = clean_text.strip()
        
        if not clean_text:
            raise HTTPException(400, "Empty text")
        
        if len(clean_text) > 4000:
            clean_text = clean_text[:4000] + "..."
        
        response = client.audio.speech.create(
            model="tts-1",
            voice=req.voice,
            input=clean_text
        )
        
        return StreamingResponse(
            io.BytesIO(response.content),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Text-to-speech error: {e}")
        raise HTTPException(500, f"TTS error: {str(e)}")


# ============ CANDIDATE FOCUS FEATURES ============

# Separate history for focus chats
focus_chat_histories = {}


class FocusChatRequest(BaseModel):
    message: str
    candidate_id: int
    conversation_history: list = []
    anonymize: bool = False


class WebSearchRequest(BaseModel):
    query: str
    candidate_id: Optional[int] = None
    candidate_name: Optional[str] = None


@router.post("/focus")
async def focus_chat(req: FocusChatRequest, user=Depends(get_current_user)):
    """1-on-1 focused chat about a single candidate"""
    try:
        # Verify candidate exists
        if req.candidate_id not in resume_rag.candidates:
            return {"response": "Candidate not found. Please select a valid candidate.", "suggestions": []}

        candidate = resume_rag.candidates[req.candidate_id]
        candidate_name = candidate.get('name', 'Unknown')

        # Build context from candidate data
        ctx = f"Name: {candidate_name}\n"
        ctx += f"Predicted Role: {candidate.get('predicted_role', 'N/A')}\n"
        ctx += f"Experience Level: {candidate.get('experience_level', 'N/A')}\n"
        ctx += f"Total Experience: {candidate.get('total_experience_years', 'N/A')} years\n"
        ctx += f"Location: {candidate.get('location', 'N/A')}\n"
        ctx += f"Summary: {candidate.get('summary', 'N/A')}\n"
        
        skills = candidate.get('skills', [])
        skills_str = ', '.join([s if isinstance(s, str) else s.get('name', '') for s in skills])
        ctx += f"Skills: {skills_str}\n"
        
        if candidate.get('key_strengths'):
            ctx += f"Key Strengths: {', '.join(candidate['key_strengths'])}\n"
        
        if candidate.get('work_experience'):
            ctx += "\nWork History:\n"
            for exp in candidate['work_experience'][:8]:
                dur = exp.get('duration_months', 0)
                dur_str = f"{dur} months" if dur else "N/A"
                ctx += f"- {exp.get('title')} at {exp.get('company')} ({exp.get('start_date', '?')} - {exp.get('end_date', '?')}, {dur_str})\n"
        
        if candidate.get('education'):
            ctx += "\nEducation:\n"
            for edu in candidate['education'][:4]:
                ctx += f"- {edu.get('degree')} - {edu.get('institution')}\n"
        
        # Also get raw resume text for deeper questions
        resume_text = candidate.get('text', '')
        if resume_text and len(resume_text) > 3000:
            resume_text = resume_text[:3000] + "..."

        display_name = "The Candidate" if req.anonymize else candidate_name

        # ============ AUTO WEB SEARCH ============
        # Determine if the question needs web search
        web_context = ""
        web_sources = []
        
        needs_web_keywords = [
            'linkedin', 'github', 'portfolio', 'website', 'online', 'social media',
            'search', 'find', 'look up', 'google', 'web', 'internet', 'profile',
            'current', 'latest', 'recent', 'now', 'today', 'news', 'articles',
            'company', 'employer', 'where do they work', 'where does',
            'reviews', 'publications', 'blog', 'projects online', 'open source',
            'salary', 'market rate', 'industry', 'average', 'trends',
            'background check', 'verify', 'confirm', 'validate',
            'tell me about', 'who is', 'what do you know about', 'more about',
            'search about', 'find out', 'look into', 'research'
        ]
        
        msg_lower = req.message.lower()
        should_search = any(kw in msg_lower for kw in needs_web_keywords)
        
        # Also search if the user explicitly mentions searching
        if not should_search:
            # Use LLM to decide if web search would help
            try:
                from langchain_core.messages import HumanMessage as HM, SystemMessage as SM
                decide_msgs = [
                    SM(content="You decide if a web search would help answer a question about a job candidate. Reply ONLY 'YES' or 'NO'. Say YES if the question asks about anything not typically found in a resume (online presence, current news, market data, company info, verification). Say NO if the question can be answered purely from resume data."),
                    HM(content=f"Question: {req.message}\nCandidate: {candidate_name}")
                ]
                decide_response = await resume_rag.llm.ainvoke(decide_msgs)
                if 'YES' in decide_response.content.upper():
                    should_search = True
            except:
                pass
        
        if should_search:
            try:
                tavily_api_key = getattr(settings, 'tavily_api_key', '') or os.environ.get('TAVILY_API_KEY', '')
                if tavily_api_key and not req.anonymize:
                    from tavily import TavilyClient
                    tavily = TavilyClient(api_key=tavily_api_key)
                    
                    # Build smart search query
                    search_query = f"{candidate_name} {req.message}"
                    # Keep query concise
                    if len(search_query) > 100:
                        search_query = f"{candidate_name} {' '.join(req.message.split()[:8])}"
                    
                    search_response = tavily.search(
                        query=search_query,
                        search_depth="basic",
                        max_results=5,
                        include_answer=True
                    )
                    
                    # Build web context
                    if search_response.get("answer"):
                        web_context += f"\n\nWEB SEARCH SUMMARY:\n{search_response['answer']}\n"
                    
                    web_context += "\nWEB SEARCH RESULTS:\n"
                    for i, item in enumerate(search_response.get("results", [])[:5], 1):
                        title = item.get("title", "")
                        content = item.get("content", "")[:200]
                        url = item.get("url", "")
                        web_context += f"\n[{i}] {title}\n{content}\nSource: {url}\n"
                        web_sources.append({"title": title, "url": url})
                    
                    print(f"🔍 Web search performed for: {search_query}")
            except Exception as e:
                print(f"Web search failed (non-critical): {e}")
                web_context = ""

        # ============ BUILD SYSTEM PROMPT ============
        web_instructions = ""
        if web_context:
            web_instructions = f"""

WEB SEARCH DATA (use this to supplement resume information):
{web_context}

WHEN USING WEB DATA:
- Clearly distinguish between resume data and web findings
- Use phrases like "Based on web search..." or "According to online sources..."
- Include source links in markdown format: [Source Title](url)
- If web results contradict resume, mention both and note the discrepancy
- Web data supplements but doesn't replace resume analysis"""

        focus_system_prompt = f"""You are an expert resume analyst with web search capabilities, similar to Perplexity AI.
You are analyzing ONLY ONE candidate: {display_name}

STRUCTURED CANDIDATE DATA:
{ctx}

RAW RESUME TEXT:
{resume_text}
{web_instructions}

RULES:
1. Answer using BOTH resume data AND web search results when available
2. If info is NOT in resume AND no web results: "This information is not available in {display_name}'s resume or online sources"
3. When web results are available, cite them with links
4. NEVER hallucinate — only use provided data
5. NEVER discuss anything unrelated to the candidate or hiring
6. If asked about non-candidate topics: "I'm focused on analyzing {display_name}. I can help with questions about their skills, experience, online presence, and career fit."
7. Be thorough — combine resume insights with web findings for comprehensive answers
8. Format responses clearly with sections when mixing resume + web data

{"ANONYMIZATION ON: Use 'The Candidate' instead of real name. Do NOT perform web searches." if req.anonymize else "Use real candidate name. Web search is available."}

Respond helpfully using **bold** for key points. Include source links when using web data."""

        # Use resume_rag's LLM
        if not resume_rag.llm:
            return {"response": "**Error:** AI service not initialized. Check OpenAI API key.", "suggestions": []}

        from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

        llm_messages = [SystemMessage(content=focus_system_prompt)]

        # Add conversation history (last 20 messages)
        for msg in req.conversation_history[-20:]:
            if msg.get("role") == "user":
                llm_messages.append(HumanMessage(content=msg["content"]))
            elif msg.get("role") == "assistant":
                llm_messages.append(AIMessage(content=msg["content"]))

        llm_messages.append(HumanMessage(content=req.message))

        response = await resume_rag.llm.ainvoke(llm_messages)
        ai_response = response.content

        # Handle anonymization in response
        if req.anonymize and candidate_name:
            import re
            name_parts = candidate_name.split()
            for part in name_parts:
                if len(part) > 2:
                    ai_response = re.sub(re.escape(part), "The Candidate", ai_response, flags=re.IGNORECASE)

        # Add sources footer if web search was used
        if web_sources:
            ai_response += "\n\n---\n**🔍 Sources:**\n"
            for src in web_sources:
                if src["url"]:
                    ai_response += f"- [{src['title']}]({src['url']})\n"

        # Generate suggestions
        try:
            suggestion_context = "with web search capabilities" if web_context else "from resume only"
            suggestion_msgs = [
                SystemMessage(content=f"Based on this conversation about {display_name} ({suggestion_context}), suggest 3 short follow-up questions. Mix resume questions with web-searchable questions. Return ONLY 3 questions, one per line, no numbering or bullets."),
                HumanMessage(content=req.message),
                AIMessage(content=ai_response)
            ]
            suggestion_response = await resume_rag.llm.ainvoke(suggestion_msgs)
            suggestions = [s.strip() for s in suggestion_response.content.strip().split('\n') if s.strip()][:3]
        except:
            suggestions = []

        return {"response": ai_response, "suggestions": suggestions}

    except Exception as e:
        print(f"Focus chat error: {e}")
        return {"response": f"**Error:** {str(e)}", "suggestions": []}


@router.post("/web-search")
async def web_search(req: WebSearchRequest, user=Depends(get_current_user)):
    """Search the web about a candidate using Tavily"""
    try:
        from tavily import TavilyClient
        
        tavily_api_key = getattr(settings, 'tavily_api_key', '') or os.environ.get('TAVILY_API_KEY', '')
        
        if not tavily_api_key:
            return {"results": [{"title": "Configuration Error", "snippet": "Tavily API key not configured. Add TAVILY_API_KEY to your .env file.", "url": ""}]}
        
        client = TavilyClient(api_key=tavily_api_key)
        
        # Perform real web search
        response = client.search(
            query=req.query,
            search_depth="basic",
            max_results=5,
            include_answer=True
        )
        
        results = []
        
        # Add AI-generated answer as first result if available
        if response.get("answer"):
            results.append({
                "title": "AI Summary",
                "snippet": response["answer"],
                "url": ""
            })
        
        # Add actual search results
        for item in response.get("results", []):
            results.append({
                "title": item.get("title", "No title"),
                "snippet": item.get("content", "")[:300],
                "url": item.get("url", "")
            })
        
        if not results:
            results.append({"title": "No Results", "snippet": "No results found for this query. Try different keywords.", "url": ""})
        
        return {"results": results}
    
    except ImportError:
        return {"results": [{"title": "Missing Package", "snippet": "Tavily package not installed. Run: pip install tavily-python", "url": ""}]}
    except Exception as e:
        print(f"Web search error: {e}")
        return {"results": [{"title": "Search Error", "snippet": f"Could not perform search: {str(e)}", "url": ""}]}# ═══════════════════════════════════════════════════════════════
# ADD THIS TO THE END OF chat.py (before the last line)
# ═══════════════════════════════════════════════════════════════

class HiringAgentRequest(BaseModel):
    candidate_id: int
    role: Optional[str] = None
    experience_required: Optional[str] = None
    level: Optional[str] = None
    job_description: Optional[str] = None
    anonymize: bool = False


@router.post("/hiring-agent")
async def hiring_agent(req: HiringAgentRequest, user=Depends(get_current_user)):
    """Hiring Manager Agent - evaluates candidate fit for a role"""
    try:
        if req.candidate_id not in resume_rag.candidates:
            return {"error": "Candidate not found. Please select a valid candidate."}

        candidate = resume_rag.candidates[req.candidate_id]
        candidate_name = candidate.get('name', 'Unknown')
        display_name = "The Candidate" if req.anonymize else candidate_name

        if not resume_rag.llm:
            return {"error": "AI service not initialized. Check OpenAI API key."}

        # ─── Build candidate context ───
        ctx = f"Name: {candidate_name}\n"
        ctx += f"Predicted Role: {candidate.get('predicted_role', 'N/A')}\n"
        ctx += f"Experience Level: {candidate.get('experience_level', 'N/A')}\n"
        ctx += f"Total Experience: {candidate.get('total_experience_years', 'N/A')} years\n"
        ctx += f"Location: {candidate.get('location', 'N/A')}\n"
        ctx += f"Summary: {candidate.get('summary', 'N/A')}\n"

        skills = candidate.get('skills', [])
        skills_str = ', '.join([s if isinstance(s, str) else s.get('name', '') for s in skills])
        ctx += f"Skills: {skills_str}\n"

        if candidate.get('key_strengths'):
            ctx += f"Key Strengths: {', '.join(candidate['key_strengths'])}\n"

        if candidate.get('work_experience'):
            ctx += "\nWork History:\n"
            for exp in candidate['work_experience'][:8]:
                dur = exp.get('duration_months', 0)
                dur_str = f"{dur} months" if dur else "N/A"
                ctx += f"- {exp.get('title')} at {exp.get('company')} ({exp.get('start_date', '?')} - {exp.get('end_date', '?')}, {dur_str})\n"

        if candidate.get('education'):
            ctx += "\nEducation:\n"
            for edu in candidate['education'][:4]:
                ctx += f"- {edu.get('degree')} - {edu.get('institution')}\n"

        resume_text = candidate.get('text', '')
        if resume_text and len(resume_text) > 4000:
            resume_text = resume_text[:4000] + "..."

        # ─── Web search for online presence ───
        web_context = ""
        if not req.anonymize:
            try:
                tavily_api_key = getattr(settings, 'tavily_api_key', '') or os.environ.get('TAVILY_API_KEY', '')
                if tavily_api_key:
                    from tavily import TavilyClient
                    tavily = TavilyClient(api_key=tavily_api_key)

                    search_response = tavily.search(
                        query=f"{candidate_name} professional profile",
                        search_depth="basic",
                        max_results=3,
                        include_answer=True
                    )

                    if search_response.get("answer"):
                        web_context += f"\nONLINE PRESENCE SUMMARY:\n{search_response['answer']}\n"

                    for item in search_response.get("results", [])[:3]:
                        web_context += f"\n- {item.get('title', '')}: {item.get('content', '')[:150]} ({item.get('url', '')})\n"

                    print(f"🔍 Hiring Agent web search for: {candidate_name}")
            except Exception as e:
                print(f"Web search failed (non-critical): {e}")

        # ─── Build the hiring agent prompt ───
        if req.job_description:
            # MODE 1: Full JD analysis
            agent_prompt = f"""You are an expert Hiring Manager with 15+ years of experience in talent acquisition.

CANDIDATE RESUME DATA:
{ctx}

RAW RESUME TEXT:
{resume_text}

{f'ONLINE PRESENCE:{web_context}' if web_context else ''}

JOB DESCRIPTION TO EVALUATE AGAINST:
{req.job_description}

YOUR TASK:
Perform a comprehensive evaluation of {display_name} against this job description.

Generate a detailed report in this EXACT format:

## 🎯 Evaluation Report: {display_name}

### 📋 Position Match
- **Role from JD:** [Extract the role title from JD]
- **Required Experience:** [Extract from JD]
- **Required Level:** [Extract from JD]

### 📊 Overall Fit Score: [X/100]
[One line explanation of the score]

### ✅ Strengths & Matches
[List 4-6 specific ways the candidate matches the JD requirements. Be specific with skills, experience, etc.]

### 🔄 Growth Areas
[List 2-4 areas where the candidate may need development. Frame these POLITELY as growth opportunities, not weaknesses. For example: "Could benefit from more experience in X" instead of "Lacks X".]

### 💡 Recommendation
[One of these outcomes, explained thoughtfully:]
- **Strong Fit** — Ready for this role
- **Good Fit with Development** — Could succeed with some ramp-up in specific areas
- **Better Fit for Related Role** — Suggest a more suitable position and explain why
- **Potential Fit at Different Level** — Suggest appropriate level (e.g., "Would be an excellent Junior/Mid candidate")

### 🌐 Online Presence
[Summary of what was found online, with links if available. If nothing found, note that.]

### 📌 Interview Recommendations
[Suggest 3-4 specific interview questions to validate the candidate's fit for this role]

IMPORTANT RULES:
- Be professional, constructive, and encouraging
- NEVER be harsh or dismissive
- Frame gaps as opportunities for growth
- If the candidate is not a fit, suggest where they WOULD be a great fit
- Use specific data from the resume to back up your assessment
- {"Use 'The Candidate' instead of real name" if req.anonymize else "Use the candidate's real name"}"""

        else:
            # MODE 2: Quick setup
            role = req.role or "Software Engineer"
            exp = req.experience_required or "3-5 years"
            level = req.level or "Mid-Level"

            agent_prompt = f"""You are an expert Hiring Manager with 15+ years of experience in talent acquisition.

CANDIDATE RESUME DATA:
{ctx}

RAW RESUME TEXT:
{resume_text}

{f'ONLINE PRESENCE:{web_context}' if web_context else ''}

POSITION REQUIREMENTS:
- Role: {role}
- Experience Required: {exp}
- Seniority Level: {level}

YOUR TASK:
Evaluate {display_name} for the {level} {role} position requiring {exp} of experience.

Generate a detailed report in this EXACT format:

## 🎯 Evaluation Report: {display_name}

### 📋 Position Details
- **Target Role:** {role}
- **Required Experience:** {exp}
- **Required Level:** {level}
- **Candidate's Current Level:** {candidate.get('experience_level', 'N/A')}
- **Candidate's Experience:** {candidate.get('total_experience_years', 'N/A')} years

### 📊 Overall Fit Score: [X/100]
[One line explanation of the score]

### ✅ Strengths & Matches
[List 4-6 specific strengths that align with this role. Reference actual skills, projects, and experience from the resume.]

### 🔄 Growth Areas
[List 2-4 areas for development. Be KIND and constructive. Frame as "could benefit from" or "opportunity to grow in" rather than "lacks" or "missing".]

### 💡 Recommendation
[Provide ONE of these thoughtful outcomes:]
- **Strong Fit** — {display_name} is well-suited for this {level} {role} position
- **Good Fit with Development** — Could succeed with mentoring in specific areas
- **Better Fit for [Alternative Role]** — Explain why another role suits them better
- **Consider for [Different Level]** — If they're better suited as Junior/Senior, explain kindly

### 🌐 Online Presence
[Summary of what was found online about this candidate, with links if available]

### 📌 Suggested Interview Questions
[3-4 targeted questions specific to this candidate and role]

IMPORTANT RULES:
- Be professional, constructive, and encouraging
- NEVER be harsh, dismissive, or condescending
- Every candidate has value — highlight where they shine
- If not a fit for THIS role, enthusiastically recommend where they WOULD excel
- Use specific resume data to support every point
- {"Use 'The Candidate' instead of real name" if req.anonymize else "Use the candidate's real name"}"""

        # ─── Call LLM ───
        from langchain_core.messages import HumanMessage, SystemMessage
        response = await resume_rag.llm.ainvoke([
            SystemMessage(content="You are an expert Hiring Manager AI agent. Generate professional, kind, and thorough evaluation reports."),
            HumanMessage(content=agent_prompt)
        ])

        report = response.content

        # Handle anonymization
        if req.anonymize and candidate_name:
            import re
            name_parts = candidate_name.split()
            for part in name_parts:
                if len(part) > 2:
                    report = re.sub(re.escape(part), "The Candidate", report, flags=re.IGNORECASE)

        return {"report": report}

    except Exception as e:
        print(f"Hiring agent error: {e}")
        return {"error": f"Evaluation failed: {str(e)}"}


# ============ EMAIL DRAFT ============

class EmailDraftRequest(BaseModel):
    candidate_id: int
    email_type: str  # 'interest' | 'interview' | 'offer' | 'pass' | 'followup'
    evaluation_report: Optional[str] = None
    anonymize: bool = False


@router.post("/draft-email")
async def draft_email(req: EmailDraftRequest, user=Depends(get_current_user)):
    """Draft an email to a candidate based on evaluation"""
    try:
        if req.candidate_id not in resume_rag.candidates:
            return {"subject": "", "body": "Candidate not found."}

        candidate = resume_rag.candidates[req.candidate_id]
        candidate_name = candidate.get('name', 'Candidate')
        display_name = "Candidate" if req.anonymize else candidate_name
        first_name = "Candidate" if req.anonymize else candidate_name.split()[0]
        role = candidate.get('predicted_role', 'the position')

        if not resume_rag.llm:
            return {"subject": "Regarding Your Application", "body": f"Hi {first_name},\n\nThank you for your interest.\n\nBest regards"}

        email_type_prompts = {
            "interest": f"Write a professional email expressing interest in {display_name} as a candidate. Invite them to learn more about the opportunity and express enthusiasm about their background.",
            "interview": f"Write a professional email to schedule an interview with {display_name}. Ask for their availability in the coming week. Be warm and professional.",
            "offer": f"Write a professional email to {display_name} initiating offer discussions. Express excitement about having them join the team. Keep it high-level — mention next steps without specific numbers.",
            "pass": f"Write a kind, respectful email to {display_name} letting them know you've decided to move forward with other candidates. Thank them genuinely for their time. Encourage them to apply for future openings. Do NOT be condescending or generic.",
            "followup": f"Write a professional follow-up email to {display_name}. Check in on their interest and availability. Keep it brief and friendly."
        }

        type_prompt = email_type_prompts.get(req.email_type, email_type_prompts["interest"])

        evaluation_context = ""
        if req.evaluation_report:
            evaluation_context = f"\n\nEVALUATION CONTEXT (use this to personalize the email):\n{req.evaluation_report[:2000]}"

        prompt = f"""{type_prompt}

CANDIDATE INFO:
- Name: {display_name}
- Role: {role}
- Experience: {candidate.get('total_experience_years', 'N/A')} years
- Skills: {', '.join(candidate.get('skills', [])[:8]) if isinstance(candidate.get('skills', []), list) else 'N/A'}
{evaluation_context}

RULES:
- Be warm, professional, and genuine
- Keep it concise (under 200 words for body)
- Reference specific things from their background to show you actually reviewed their profile
- Sign off with [Your Name] as placeholder
- Do NOT use generic corporate jargon
- {"Use 'Candidate' instead of real name" if req.anonymize else f"Use their first name: {first_name}"}

Return in this EXACT format (no markdown, no backticks):
SUBJECT: <email subject line>
BODY:
<email body text>"""

        from langchain_core.messages import HumanMessage, SystemMessage
        response = await resume_rag.llm.ainvoke([
            SystemMessage(content="You are a professional recruiter writing personalized emails. Write naturally — not robotic."),
            HumanMessage(content=prompt)
        ])

        content = response.content.strip()

        # Parse subject and body
        subject = ""
        body = content

        if "SUBJECT:" in content and "BODY:" in content:
            parts = content.split("BODY:", 1)
            subject_part = parts[0]
            body = parts[1].strip() if len(parts) > 1 else content

            subject_line = subject_part.replace("SUBJECT:", "").strip()
            subject = subject_line.split("\n")[0].strip()
        else:
            # Fallback
            lines = content.split("\n")
            if lines:
                subject = lines[0].replace("Subject:", "").replace("SUBJECT:", "").strip()
                body = "\n".join(lines[1:]).strip()

        # Anonymize if needed
        if req.anonymize and candidate_name:
            import re
            for part in candidate_name.split():
                if len(part) > 2:
                    subject = re.sub(re.escape(part), "Candidate", subject, flags=re.IGNORECASE)
                    body = re.sub(re.escape(part), "Candidate", body, flags=re.IGNORECASE)

        return {"subject": subject, "body": body}

    except Exception as e:
        print(f"Email draft error: {e}")
        return {"subject": "Regarding Your Application", "body": f"Hi,\n\nThank you for your application.\n\nBest regards,\n[Your Name]"}
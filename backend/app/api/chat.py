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
    candidate_data: Optional[dict] = None
    scan_data: Optional[dict] = None
    scan_contact: Optional[dict] = None


class WebSearchRequest(BaseModel):
    query: str
    candidate_id: Optional[int] = None
    candidate_name: Optional[str] = None


@router.post("/focus")
async def focus_chat(req: FocusChatRequest, user=Depends(get_current_user)):
    """1-on-1 focused chat about a single candidate"""
    try:
        # Verify candidate exists - try backend first, fall back to frontend data
        candidate = resume_rag.candidates.get(req.candidate_id)
        if not candidate and req.candidate_data:
            candidate = req.candidate_data
        if not candidate:
            return {"response": "Candidate not found. Please re-upload the resume.", "suggestions": []}
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

        # ═══ BUILD SCAN DATA CONTEXT ═══
        scan_context = ""
        if req.scan_data:
            scan_context += "\n\n═══ SCANNED ONLINE PROFILES ═══\n"
            
            gh = req.scan_data.get("github")
            if gh:
                scan_context += f"\n🐙 GITHUB PROFILE (@{gh.get('username', '')}):\n"
                scan_context += f"- Name: {gh.get('name', '')}\n"
                scan_context += f"- Bio: {gh.get('bio', '')}\n"
                scan_context += f"- Public Repos: {gh.get('public_repos', '0')}\n"
                scan_context += f"- Followers: {gh.get('followers', '0')}\n"
                scan_context += f"- Location: {gh.get('location', '')}\n"
                scan_context += f"- Company: {gh.get('company', '')}\n"
                scan_context += f"- Website: {gh.get('website', '')}\n"
                scan_context += f"- Profile URL: {gh.get('url', '')}\n"
                pinned = gh.get('pinned_repos', [])
                if pinned:
                    scan_context += "- Pinned Repositories:\n"
                    for repo in pinned:
                        scan_context += f"  • {repo.get('name', '')} ({repo.get('language', 'N/A')}): {repo.get('description', '')}\n"
            
            li = req.scan_data.get("linkedin")
            if li:
                scan_context += f"\n💼 LINKEDIN PROFILE:\n"
                scan_context += f"- Name: {li.get('name', '')}\n"
                scan_context += f"- Headline: {li.get('headline', '')}\n"
                scan_context += f"- Location: {li.get('location', '')}\n"
                scan_context += f"- About: {li.get('about', '')}\n"
                scan_context += f"- Profile URL: {li.get('url', '')}\n"
                if li.get('note'):
                    scan_context += f"- Note: {li.get('note')}\n"
            
            port = req.scan_data.get("portfolio")
            if port:
                scan_context += f"\n🌐 PORTFOLIO:\n"
                scan_context += f"- URL: {port.get('url', '')}\n"
                scan_context += f"- Title: {port.get('title', '')}\n"
                scan_context += f"- Description: {port.get('description', '')}\n"
        
        if req.scan_contact:
            if req.scan_contact.get('email') or req.scan_contact.get('phone'):
                scan_context += f"\n📧 CONTACT INFO:\n"
                if req.scan_contact.get('email'):
                    scan_context += f"- Email: {req.scan_contact['email']}\n"
                if req.scan_contact.get('phone'):
                    scan_context += f"- Phone: {req.scan_contact['phone']}\n"

        focus_system_prompt = f"""You are an expert resume analyst with access to multiple data sources about this candidate, similar to Perplexity AI.
You are analyzing ONLY ONE candidate: {display_name}

STRUCTURED CANDIDATE DATA (from resume):
{ctx}

RAW RESUME TEXT:
{resume_text}
{scan_context}
{web_instructions}

RULES:
1. Answer using ALL available data sources: resume, GitHub, LinkedIn, web search
2. When referencing GitHub data, mention specific repos, languages, and activity
3. When referencing LinkedIn data, mention their headline, connections, or career progression
4. Cross-reference data across sources — note if GitHub skills match resume skills, if LinkedIn title matches resume role, etc.
5. If info is NOT available in ANY source: "This information is not available from any of the sources I have"
6. NEVER hallucinate — only use provided data
7. NEVER discuss anything unrelated to the candidate or hiring
8. If asked about a project, check BOTH resume AND GitHub pinned repos
9. Be thorough — combine all sources for the most comprehensive answer
10. Format responses clearly, indicating which source each piece of info comes from

{"ANONYMIZATION ON: Use 'The Candidate' instead of real name." if req.anonymize else "Use real candidate name."}

Respond helpfully using **bold** for key points. Cite sources like [Resume], [GitHub], [LinkedIn] when relevant."""

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
    candidate_data: Optional[dict] = None


@router.post("/hiring-agent")
async def hiring_agent(req: HiringAgentRequest, user=Depends(get_current_user)):
    """Hiring Manager Agent - evaluates candidate fit for a role"""
    try:
        candidate = resume_rag.candidates.get(req.candidate_id)
        if not candidate and req.candidate_data:
            candidate = req.candidate_data
        if not candidate:
            return {"error": "Candidate not found. Please re-upload the resume."}

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
    email_type: str
    evaluation_report: Optional[str] = None
    anonymize: bool = False
    candidate_data: Optional[dict] = None


@router.post("/draft-email")
async def draft_email(req: EmailDraftRequest, user=Depends(get_current_user)):
    """Draft an email to a candidate based on evaluation"""
    try:
        candidate = resume_rag.candidates.get(req.candidate_id)
        if not candidate and req.candidate_data:
            candidate = req.candidate_data
        if not candidate:
            return {"subject": "", "body": "Candidate not found. Please re-upload the resume."}

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


# ============ GITHUB PROFILE ANALYZER ============

class GitHubRequest(BaseModel):
    candidate_data: Optional[dict] = None
    candidate_id: int
    github_username: Optional[str] = None
    anonymize: bool = False


@router.post("/github-analyze")
async def github_analyze(req: GitHubRequest, user=Depends(get_current_user)):
    """Fetch and analyze a candidate's GitHub profile"""
    try:
        import httpx
        import re
        
        candidate = resume_rag.candidates.get(req.candidate_id)
        if not candidate and req.candidate_data:
            candidate = req.candidate_data
        
        # Try to find GitHub username
        username = req.github_username
        
        if not username and candidate:
            # Search resume text for GitHub URL
            resume_text = candidate.get('text', '') or candidate.get('raw_text', '')
            gh_match = re.search(r'github\.com/([a-zA-Z0-9_-]+)', resume_text)
            if gh_match:
                username = gh_match.group(1)
        
        if not username and candidate:
            # Try Tavily to find their GitHub
            try:
                tavily_key = getattr(settings, 'tavily_api_key', '')
                if tavily_key:
                    from tavily import TavilyClient
                    tavily = TavilyClient(api_key=tavily_key)
                    name = candidate.get('name', '')
                    search = tavily.search(query=f"{name} github.com profile", max_results=3)
                    for r in search.get('results', []):
                        url = r.get('url', '')
                        gh_match = re.search(r'github\.com/([a-zA-Z0-9_-]+)', url)
                        if gh_match:
                            username = gh_match.group(1)
                            break
            except:
                pass
        
        if not username:
            return {"error": "Could not find GitHub username. Please enter it manually.", "needs_username": True}
        
        # Fetch GitHub data
        github_token = getattr(settings, 'github_token', '') or os.environ.get('GITHUB_TOKEN', '')
        headers = {"Accept": "application/vnd.github.v3+json"}
        if github_token:
            headers["Authorization"] = f"token {github_token}"
        
        async with httpx.AsyncClient() as client:
            # User profile
            user_resp = await client.get(f"https://api.github.com/users/{username}", headers=headers)
            if user_resp.status_code != 200:
                return {"error": f"GitHub user '{username}' not found"}
            user_data = user_resp.json()
            
            # Repos
            repos_resp = await client.get(f"https://api.github.com/users/{username}/repos?sort=updated&per_page=10", headers=headers)
            repos_data = repos_resp.json() if repos_resp.status_code == 200 else []
            
            # Events (contributions)
            events_resp = await client.get(f"https://api.github.com/users/{username}/events?per_page=30", headers=headers)
            events_data = events_resp.json() if events_resp.status_code == 200 else []
        
        # Process data
        languages = {}
        top_repos = []
        for repo in repos_data[:10]:
            if repo.get('fork'):
                continue
            lang = repo.get('language')
            if lang:
                languages[lang] = languages.get(lang, 0) + 1
            top_repos.append({
                "name": repo.get('name', ''),
                "description": repo.get('description', '') or 'No description',
                "language": lang or 'N/A',
                "stars": repo.get('stargazers_count', 0),
                "forks": repo.get('forks_count', 0),
                "url": repo.get('html_url', ''),
                "updated": repo.get('updated_at', '')[:10]
            })
        
        # Count recent contributions
        push_events = sum(1 for e in events_data if e.get('type') == 'PushEvent')
        pr_events = sum(1 for e in events_data if e.get('type') == 'PullRequestEvent')
        
        profile = {
            "username": username,
            "name": user_data.get('name', username),
            "bio": user_data.get('bio', ''),
            "avatar_url": user_data.get('avatar_url', ''),
            "profile_url": user_data.get('html_url', ''),
            "public_repos": user_data.get('public_repos', 0),
            "followers": user_data.get('followers', 0),
            "following": user_data.get('following', 0),
            "location": user_data.get('location', ''),
            "company": user_data.get('company', ''),
            "blog": user_data.get('blog', ''),
            "created_at": user_data.get('created_at', '')[:10],
            "languages": dict(sorted(languages.items(), key=lambda x: x[1], reverse=True)),
            "top_repos": top_repos[:6],
            "recent_pushes": push_events,
            "recent_prs": pr_events
        }
        
        # Generate AI analysis
        if resume_rag.llm:
            from langchain_core.messages import HumanMessage, SystemMessage
            analysis_prompt = f"""Analyze this GitHub profile for hiring purposes:

Profile: {username} ({user_data.get('name', '')})
Bio: {user_data.get('bio', 'N/A')}
Public Repos: {user_data.get('public_repos', 0)}
Followers: {user_data.get('followers', 0)}
Languages: {', '.join(languages.keys())}
Top Repos: {', '.join(r['name'] for r in top_repos[:5])}
Recent Activity: {push_events} pushes, {pr_events} PRs in last 30 events
Account Created: {user_data.get('created_at', '')[:10]}

Provide a brief 3-4 sentence hiring-focused analysis of this GitHub profile. Focus on activity level, technical breadth, and notable projects."""

            ai_resp = await resume_rag.llm.ainvoke([
                SystemMessage(content="You are a technical recruiter analyzing GitHub profiles. Be concise and insightful."),
                HumanMessage(content=analysis_prompt)
            ])
            profile["ai_analysis"] = ai_resp.content
        
        return {"profile": profile}
    
    except Exception as e:
        print(f"GitHub analysis error: {e}")
        return {"error": f"GitHub analysis failed: {str(e)}"}


# ============ CALENDLY INTEGRATION ============

class CalendlyRequest(BaseModel):
    candidate_id: int
    anonymize: bool = False


@router.get("/calendly-link")
async def get_calendly_link(user=Depends(get_current_user)):
    """Get the user's Calendly scheduling link"""
    try:
        import httpx
        
        calendly_token = getattr(settings, 'calendly_token', '') or os.environ.get('CALENDLY_TOKEN', '')
        if not calendly_token:
            return {"error": "Calendly token not configured. Add CALENDLY_TOKEN to your .env file.", "event_types": [], "scheduling_url": ""}
        
        print(f"🔍 Calendly token found: {calendly_token[:20]}...")
        
        async with httpx.AsyncClient(timeout=15) as client:
            # Get current user
            user_resp = await client.get(
                "https://api.calendly.com/users/me",
                headers={"Authorization": f"Bearer {calendly_token}", "Content-Type": "application/json"}
            )
            
            print(f"🔍 Calendly /users/me status: {user_resp.status_code}")
            
            if user_resp.status_code != 200:
                error_text = user_resp.text[:200]
                print(f"❌ Calendly error response: {error_text}")
                return {"error": f"Calendly auth failed (status {user_resp.status_code}). Check your token.", "event_types": [], "scheduling_url": ""}
            
            resp_json = user_resp.json()
            print(f"🔍 Calendly response keys: {list(resp_json.keys())}")
            
            # Handle both response formats
            user_data = resp_json.get("resource") or resp_json
            if not user_data:
                return {"error": "Unexpected Calendly response format", "event_types": [], "scheduling_url": ""}
            
            user_uri = user_data.get("uri", "")
            scheduling_url = user_data.get("scheduling_url", "")
            user_name = user_data.get("name", "")
            
            print(f"✅ Calendly user: {user_name}, URI: {user_uri}")
            
            # Get event types
            event_types = []
            if user_uri:
                events_resp = await client.get(
                    f"https://api.calendly.com/event_types?user={user_uri}&active=true",
                    headers={"Authorization": f"Bearer {calendly_token}", "Content-Type": "application/json"}
                )
                
                print(f"🔍 Calendly event_types status: {events_resp.status_code}")
                
                if events_resp.status_code == 200:
                    events_json = events_resp.json()
                    for ev in events_json.get("collection", []):
                        event_types.append({
                            "name": ev.get("name", "Meeting"),
                            "duration": ev.get("duration", 30),
                            "slug": ev.get("slug", ""),
                            "scheduling_url": ev.get("scheduling_url", scheduling_url),
                            "description": (ev.get("description_plain") or ev.get("description_html") or "")[:100]
                        })
            
            # If no event types found but we have scheduling URL
            if not event_types and scheduling_url:
                event_types.append({
                    "name": "Schedule a Meeting",
                    "duration": 30,
                    "slug": "",
                    "scheduling_url": scheduling_url,
                    "description": "Book a time on my calendar"
                })
            
            return {
                "scheduling_url": scheduling_url,
                "event_types": event_types,
                "user_name": user_name,
                "error": None
            }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Calendly integration failed: {str(e)}", "event_types": [], "scheduling_url": ""}


# ============ RESUME SCANNER AGENT ============

class ScanRequest(BaseModel):
    candidate_id: int
    anonymize: bool = False
    candidate_data: Optional[dict] = None


@router.post("/scan-resume")
async def scan_resume(req: ScanRequest, user=Depends(get_current_user)):
    """AI Agent that scans resume for links, visits profiles, extracts data"""
    import re
    import json

    # Try backend first, fall back to frontend data
    candidate = resume_rag.candidates.get(req.candidate_id)
    
    if not candidate and req.candidate_data:
        # Use data sent from frontend
        candidate = req.candidate_data
    
    if not candidate:
        return {"error": "Candidate not found", "logs": [], "profiles": {}}

    logs = []
    profiles = {"github": None, "linkedin": None, "portfolio": None, "other_links": []}
    resume_text = candidate.get('text', '') or candidate.get('raw_text', '') or ''
    candidate_name = candidate.get('name', 'Unknown')
    embedded_links = candidate.get('embedded_links', {}) or {}

    # ═══════ LAYER 0: Embedded PDF Links (highest priority) ═══════
    logs.append({"step": "scan_start", "msg": f"Initializing resume scanner for {candidate_name}..."})
    logs.append({"step": "layer0_start", "msg": "LAYER 0: Checking embedded PDF hyperlinks..."})

    gh_username = None
    li_username = None
    portfolio_url = None

    # Check embedded links first (these are the actual URLs from PDF metadata)
    if embedded_links.get('github_url'):
        gh_match = re.search(r'github\.com/([a-zA-Z0-9_-]+)', embedded_links['github_url'])
        if gh_match:
            gh_username = gh_match.group(1)
            logs.append({"step": "layer0_github", "msg": f"Found embedded GitHub link: {embedded_links['github_url']}", "status": "success"})

    if embedded_links.get('linkedin_url'):
        li_match = re.search(r'linkedin\.com/in/([a-zA-Z0-9_-]+)', embedded_links['linkedin_url'])
        if li_match:
            li_username = li_match.group(1)
            logs.append({"step": "layer0_linkedin", "msg": f"Found embedded LinkedIn link: {embedded_links['linkedin_url']}", "status": "success"})

    if embedded_links.get('portfolio_url'):
        portfolio_url = embedded_links['portfolio_url']
        logs.append({"step": "layer0_portfolio", "msg": f"Found embedded portfolio link: {portfolio_url}", "status": "success"})

    if embedded_links.get('email'):
        logs.append({"step": "layer0_email", "msg": f"Found embedded email: {embedded_links['email']}", "status": "success"})

    if embedded_links.get('all_urls'):
        logs.append({"step": "layer0_total", "msg": f"Total embedded links found: {len(embedded_links['all_urls'])}"})

    # ═══════ LAYER 1: Text Regex Extraction (fallback) ═══════
    logs.append({"step": "layer1_start", "msg": "LAYER 1: Scanning resume text for links..."})

    # GitHub - match many PDF extraction formats (only if Layer 0 didn't find it)
    if not gh_username:
        gh_patterns = [
            r'github\.com/([a-zA-Z0-9_-]+)',
            r'github:\s*@?([a-zA-Z0-9_-]+)',
            r'GitHub:\s*([a-zA-Z0-9_-]+)',
            r'/github\s*([a-zA-Z0-9_-]+)',
            r'github[^\w]*([a-zA-Z0-9_-]{2,})',
        ]
        for pattern in gh_patterns:
            match = re.search(pattern, resume_text, re.IGNORECASE)
            if match:
                gh_username = match.group(1).strip()
                if gh_username.lower() not in ['com', 'io', 'org', 'profile', 'settings', 'in', 'alt', '']:
                    logs.append({"step": "layer1_github", "msg": f"Found GitHub: github.com/{gh_username}", "status": "success"})
                    break
                else:
                    gh_username = None

    # LinkedIn - match many PDF extraction formats (only if Layer 0 didn't find it)
    if not li_username:
        li_patterns = [
            r'linkedin\.com/in/([a-zA-Z0-9_-]+)',
            r'linkedin:\s*([a-zA-Z0-9_-]+)',
            r'LinkedIn:\s*([a-zA-Z0-9_/-]+)',
            r'/linkedin-in\s*([a-zA-Z0-9_-]+)',
            r'/linkedin[^\w]*([a-zA-Z0-9_-]{2,})',
            r'linkedin[- ]*in[^\w]*([a-zA-Z0-9_-]{2,})',
        ]
        for pattern in li_patterns:
            match = re.search(pattern, resume_text, re.IGNORECASE)
            if match:
                li_username = match.group(1).strip().rstrip('/')
                if li_username.lower() not in ['in', 'com', 'profile', '']:
                    logs.append({"step": "layer1_linkedin", "msg": f"Found LinkedIn: linkedin.com/in/{li_username}", "status": "success"})
                    break
                else:
                    li_username = None

    # Portfolio/Website (only if Layer 0 didn't find it)
    if not portfolio_url:
        web_patterns = [
            r'(?:portfolio|website|blog|site)[\s:]*\s*(https?://[^\s,]+)',
            r'(https?://(?!github\.com|linkedin\.com)[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}[^\s,]*)',
        ]
        for pattern in web_patterns:
            match = re.search(pattern, resume_text, re.IGNORECASE)
            if match:
                portfolio_url = match.group(1).rstrip('.')
                logs.append({"step": "layer1_portfolio", "msg": f"Found portfolio: {portfolio_url}", "status": "success"})
                break

    # Email - handle PDF artifacts before the email address
    email_match = re.search(r'([a-zA-Z0-9][\w.-]*@[\w.-]+\.\w{2,})', resume_text)
    if email_match:
        logs.append({"step": "layer1_email", "msg": f"Found email: {email_match.group(1)}", "status": "success"})

    # Phone
    phone_match = re.search(r'[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}', resume_text)
    if phone_match:
        logs.append({"step": "layer1_phone", "msg": f"Found phone: {phone_match.group().strip()}", "status": "success"})

    if not gh_username and not li_username:
        logs.append({"step": "layer1_none", "msg": "No GitHub/LinkedIn links found in resume text", "status": "warning"})

    logs.append({"step": "layer1_done", "msg": f"Layer 1 complete. Found: {bool(gh_username)} GitHub, {bool(li_username)} LinkedIn, {bool(portfolio_url)} Portfolio"})

    # ═══════ LAYER 3: Browser Agent (Playwright - sync in thread) ═══════
    logs.append({"step": "layer3_start", "msg": "LAYER 3: Launching browser agent..."})

    try:
        import concurrent.futures

        def run_browser_scraping(gh_user, li_user, port_url):
            """Run Playwright sync API in a separate thread (Windows fix)"""
            from playwright.sync_api import sync_playwright
            
            results = {"github": None, "linkedin": None, "portfolio": None, "browser_logs": []}
            
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                page = context.new_page()

                # ── GitHub ──
                if gh_user:
                    results["browser_logs"].append({"step": "browser_github", "msg": f"Navigating to github.com/{gh_user}..."})
                    try:
                        page.goto(f"https://github.com/{gh_user}", timeout=15000)
                        page.wait_for_load_state("domcontentloaded")

                        gh_data = page.evaluate("""() => {
                            const name = document.querySelector('.p-name, [itemprop="name"]')?.innerText?.trim() || '';
                            const bio = document.querySelector('.p-note .user-profile-bio, [data-bio-text]')?.innerText?.trim() || '';
                            const avatar = document.querySelector('.avatar-user')?.src || '';
                            const followers = document.querySelector('a[href*="followers"] .text-bold, a[href*="followers"] span')?.innerText?.trim() || '0';
                            const following = document.querySelector('a[href*="following"] .text-bold, a[href*="following"] span')?.innerText?.trim() || '0';
                            const repos = document.querySelector('a[data-tab="repositories"] .Counter, nav a[href*="repositories"] .Counter')?.innerText?.trim() || '0';
                            const location = document.querySelector('[itemprop="homeLocation"], li:has(.octicon-location) span')?.innerText?.trim() || '';
                            const company = document.querySelector('[itemprop="worksFor"], li:has(.octicon-organization) span')?.innerText?.trim() || '';
                            const website = document.querySelector('[itemprop="url"] a, li:has(.octicon-link) a')?.href || '';
                            const pinned = [];
                            document.querySelectorAll('.pinned-item-list-item-content, .js-pinned-item-list-item').forEach(el => {
                                const repoName = el.querySelector('.repo')?.innerText?.trim() || el.querySelector('a span')?.innerText?.trim() || '';
                                const desc = el.querySelector('.pinned-item-desc')?.innerText?.trim() || '';
                                const lang = el.querySelector('[itemprop="programmingLanguage"]')?.innerText?.trim() || '';
                                if (repoName) pinned.push({ name: repoName, description: desc, language: lang });
                            });
                            return { name, bio, avatar, followers, following, repos, location, company, website, pinned };
                        }""")

                        results["github"] = {
                            "username": gh_user,
                            "url": f"https://github.com/{gh_user}",
                            "name": gh_data.get("name", gh_user),
                            "bio": gh_data.get("bio", ""),
                            "avatar": gh_data.get("avatar", ""),
                            "followers": gh_data.get("followers", "0"),
                            "following": gh_data.get("following", "0"),
                            "public_repos": gh_data.get("repos", "0"),
                            "location": gh_data.get("location", ""),
                            "company": gh_data.get("company", ""),
                            "website": gh_data.get("website", ""),
                            "pinned_repos": gh_data.get("pinned", [])
                        }
                        results["browser_logs"].append({"step": "browser_github_done", "msg": f"GitHub profile scraped: {gh_data.get('name', gh_user)} | {gh_data.get('repos', '?')} repos | {gh_data.get('followers', '?')} followers", "status": "success"})
                    except Exception as e:
                        results["browser_logs"].append({"step": "browser_github_err", "msg": f"GitHub scrape failed: {str(e)[:100]}", "status": "error"})

                # ── LinkedIn ──
                if li_user:
                    # Skip Playwright for LinkedIn (login wall blocks it)
                    # We'll use Tavily instead — see below
                    results["browser_logs"].append({"step": "browser_linkedin_skip", "msg": "Skipping browser for LinkedIn (login wall). Using Tavily search instead...", "status": "warning"})

                # ── Portfolio ──
                if port_url:
                    results["browser_logs"].append({"step": "browser_portfolio", "msg": f"Navigating to {port_url}..."})
                    try:
                        page.goto(port_url, timeout=10000)
                        page.wait_for_load_state("domcontentloaded")

                        port_data = page.evaluate("""() => {
                            const title = document.title || '';
                            const desc = document.querySelector('meta[name="description"]')?.content || '';
                            const h1 = document.querySelector('h1')?.innerText?.trim() || '';
                            return { title, description: desc, heading: h1 };
                        }""")

                        results["portfolio"] = {"url": port_url, "title": port_data.get("title", ""), "description": port_data.get("description", ""), "heading": port_data.get("heading", "")}
                        results["browser_logs"].append({"step": "browser_portfolio_done", "msg": f"Portfolio loaded: {port_data.get('title', port_url)}", "status": "success"})
                    except Exception as e:
                        results["browser_logs"].append({"step": "browser_portfolio_err", "msg": f"Portfolio load failed: {str(e)[:80]}", "status": "error"})

                browser.close()
            
            return results

        # Run in thread to avoid Windows async event loop issues
        loop = None
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_browser_scraping, gh_username, li_username, portfolio_url)
            browser_results = future.result(timeout=60)

        # Merge browser results
        for blog in browser_results.get("browser_logs", []):
            logs.append(blog)
        if browser_results.get("github"):
            profiles["github"] = browser_results["github"]
        if browser_results.get("linkedin"):
            profiles["linkedin"] = browser_results["linkedin"]
        if browser_results.get("portfolio"):
            profiles["portfolio"] = browser_results["portfolio"]

    except ImportError:
        logs.append({"step": "layer3_missing", "msg": "Playwright not installed. Run: pip install playwright && playwright install chromium", "status": "error"})
    except Exception as e:
        logs.append({"step": "layer3_error", "msg": f"Browser agent error: {str(e)[:150]}", "status": "error"})

    # ═══════ LINKEDIN VIA TAVILY (since Playwright gets blocked) ═══════
    if li_username and (not profiles.get("linkedin") or profiles.get("linkedin", {}).get("headline") in [None, "", "Join LinkedIn"]):
        logs.append({"step": "tavily_linkedin", "msg": f"Fetching LinkedIn data via Tavily for {li_username}..."})
        try:
            tavily_api_key = getattr(settings, 'tavily_api_key', '') or os.environ.get('TAVILY_API_KEY', '')
            if tavily_api_key:
                from tavily import TavilyClient
                tavily = TavilyClient(api_key=tavily_api_key)

                li_search = tavily.search(
                    query=f"site:linkedin.com/in/{li_username} OR {candidate_name} linkedin profile",
                    search_depth="basic",
                    max_results=3,
                    include_answer=True
                )

                li_profile = {
                    "username": li_username,
                    "url": f"https://www.linkedin.com/in/{li_username}",
                    "name": candidate_name,
                    "headline": "",
                    "location": "",
                    "about": ""
                }

                # Extract info from Tavily answer
                if li_search.get("answer"):
                    li_profile["about"] = li_search["answer"][:500]

                # Extract from search results
                for result in li_search.get("results", []):
                    content = result.get("content", "")
                    title = result.get("title", "")
                    
                    # LinkedIn titles often format as "Name - Title - Company | LinkedIn"
                    if "linkedin" in result.get("url", "").lower():
                        parts = title.split(" - ")
                        if len(parts) >= 2:
                            if not li_profile["name"] or li_profile["name"] == candidate_name:
                                li_profile["name"] = parts[0].strip()
                            li_profile["headline"] = " - ".join(parts[1:]).replace(" | LinkedIn", "").strip()
                    
                    if content and not li_profile["about"]:
                        li_profile["about"] = content[:500]

                profiles["linkedin"] = li_profile

                if li_profile.get("headline"):
                    logs.append({"step": "tavily_linkedin_done", "msg": f"LinkedIn found: {li_profile['name']} | {li_profile['headline'][:80]}", "status": "success"})
                else:
                    logs.append({"step": "tavily_linkedin_partial", "msg": f"LinkedIn partial data found for {li_username}", "status": "warning"})
        except Exception as e:
            logs.append({"step": "tavily_linkedin_err", "msg": f"Tavily LinkedIn search failed: {str(e)[:100]}", "status": "error"})

    # ═══════ AI SUMMARY ═══════
    logs.append({"step": "ai_summary", "msg": "Generating AI summary of findings..."})

    ai_summary = ""
    if resume_rag.llm:
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            summary_prompt = f"""Summarize what we found about {candidate_name} from their online profiles:

GitHub: {json.dumps(profiles.get('github'), default=str) if profiles.get('github') else 'Not found'}
LinkedIn: {json.dumps(profiles.get('linkedin'), default=str) if profiles.get('linkedin') else 'Not found'}
Portfolio: {json.dumps(profiles.get('portfolio'), default=str) if profiles.get('portfolio') else 'Not found'}

Resume Role: {candidate.get('predicted_role', 'N/A')}
Resume Skills: {', '.join(candidate.get('skills', [])[:10]) if isinstance(candidate.get('skills'), list) else 'N/A'}

Provide a brief 3-5 sentence summary for a hiring manager. Note any interesting findings or discrepancies between resume and online profiles."""

            resp = await resume_rag.llm.ainvoke([
                SystemMessage(content="You are a recruiter summarizing candidate online profiles. Be concise and insightful."),
                HumanMessage(content=summary_prompt)
            ])
            ai_summary = resp.content
        except:
            pass

    logs.append({"step": "done", "msg": "Scan complete!", "status": "success"})

    return {
        "logs": logs,
        "profiles": profiles,
        "ai_summary": ai_summary,
        "contact": {
            "email": email_match.group(1) if email_match else None,
            "phone": phone_match.group().strip() if phone_match else None
        }
    }

# ============ CANDIDATE PORTAL & INTERVIEW ============

import json as json_lib

INTERVIEWS_FILE = "interviews_data.json"

def _load_interviews_data():
    """Load interviews and access data from JSON file"""
    try:
        with open(INTERVIEWS_FILE, 'r') as f:
            data = json_lib.load(f)
            return data.get('interviews', {}), data.get('access', {})
    except (FileNotFoundError, json_lib.JSONDecodeError):
        return {}, {}

def _save_interviews_data(interviews, access):
    """Save interviews and access data to JSON file"""
    try:
        with open(INTERVIEWS_FILE, 'w') as f:
            json_lib.dump({'interviews': interviews, 'access': access}, f, indent=2)
        print(f"💾 Saved {len(interviews)} interviews, {len(access)} access grants")
    except Exception as e:
        print(f"⚠️ Failed to save interviews data: {e}")

# Load from file on startup
interviews_store, candidate_access = _load_interviews_data()
print(f"📂 Loaded {len(interviews_store)} interviews, {len(candidate_access)} access grants from file")


class CreateInterviewRequest(BaseModel):
    candidate_id: int
    candidate_email: str
    candidate_name: Optional[str] = None
    role: Optional[str] = None
    level: Optional[str] = None
    experience_required: Optional[str] = None
    num_questions: int = 8
    focus_areas: Optional[list] = None


class VerifyEmailRequest(BaseModel):
    email: str


@router.post("/create-interview")
async def create_interview(req: CreateInterviewRequest, user=Depends(get_current_user)):
    """Hiring manager creates an interview for a candidate"""
    email = req.candidate_email.strip().lower()
    
    # Grant access to candidate
    candidate_access[email] = {
        "name": req.candidate_name or "",
        "candidate_id": req.candidate_id,
        "access": True
    }
    
    # Store interview config
    interviews_store[email] = {
        "candidate_id": req.candidate_id,
        "candidate_name": req.candidate_name or "",
        "role": req.role or "General",
        "level": req.level or "Mid-Level",
        "experience_required": req.experience_required or "",
        "num_questions": req.num_questions,
        "focus_areas": req.focus_areas or [],
        "status": "pending",
        "results": None
    }
    
    print(f"✅ Interview created for {email} | Role: {req.role} | Questions: {req.num_questions}")
    
    # Persist to file
    _save_interviews_data(interviews_store, candidate_access)
    
    return {
        "message": f"Interview created for {email}",
        "interview_config": interviews_store[email]
    }


@router.post("/verify-email")
async def verify_candidate_email(req: VerifyEmailRequest):
    """Candidate verifies their email to access the portal - no auth required"""
    email = req.email.strip().lower()
    
    print(f"🔍 Candidate login attempt: {email}")
    
    # Check if email has access
    if email in candidate_access:
        access_data = candidate_access[email]
        has_interview = email in interviews_store
        interview_config = interviews_store.get(email) if has_interview else None
        
        print(f"✅ Access granted for {email}")
        
        return {
            "access": True,
            "name": access_data.get("name", ""),
            "candidate_id": access_data.get("candidate_id"),
            "has_interview": has_interview,
            "interview_config": interview_config
        }
    
    # Also check if any uploaded candidate has this email in their resume
    for cid, candidate in resume_rag.candidates.items():
        resume_text = candidate.get('text', '') or candidate.get('raw_text', '') or ''
        embedded = candidate.get('embedded_links', {}) or {}
        
        # Check resume text and embedded links for this email
        if email in resume_text.lower() or email == (embedded.get('email', '') or '').lower():
            candidate_access[email] = {
                "name": candidate.get('name', ''),
                "candidate_id": cid,
                "access": True
            }
            
            has_interview = email in interviews_store
            interview_config = interviews_store.get(email) if has_interview else None
            
            print(f"✅ Access granted for {email} (found in resume)")
            _save_interviews_data(interviews_store, candidate_access)
            
            return {
                "access": True,
                "name": candidate.get('name', ''),
                "candidate_id": cid,
                "has_interview": has_interview,
                "interview_config": interview_config
            }
    
    print(f"❌ Access denied for {email}")
    return {
        "access": False,
        "message": "No access found for this email. Please contact your hiring manager."
    }


@router.get("/interview-status/{email}")
async def get_interview_status(email: str, user=Depends(get_current_user)):
    """Check interview status for a candidate"""
    email = email.strip().lower()
    if email in interviews_store:
        return {"exists": True, "config": interviews_store[email]}
    return {"exists": False}


# ============ LIVE AI INTERVIEW ENDPOINTS ============

class GenerateQuestionsRequest(BaseModel):
    role: str = "General"
    level: str = "Mid-Level"
    num_questions: int = 8
    focus_areas: list = []
    candidate_name: str = "Candidate"


class ScoreAnswerRequest(BaseModel):
    question: str
    answer: str
    role: str = "General"
    candidate_name: str = "Candidate"


class InterviewReportRequest(BaseModel):
    candidate_name: str
    candidate_email: str
    role: str
    questions: list
    answers: list
    scores: list
    duration: int = 0


@router.post("/generate-interview-questions")
async def generate_interview_questions(req: GenerateQuestionsRequest, user=Depends(get_current_user)):
    """Generate interview questions based on role and level"""
    try:
        if not resume_rag.llm:
            return {"questions": ["Tell me about yourself.", "What are your key strengths?", "Why are you interested in this role?"]}

        from langchain_core.messages import HumanMessage, SystemMessage
        focus = f"\nFocus areas: {', '.join(req.focus_areas)}" if req.focus_areas else ""
        
        prompt = f"""Generate exactly {req.num_questions} interview questions for a {req.level} {req.role} position.{focus}

RULES:
- Mix behavioral, technical, and situational questions
- Start easy, gradually increase difficulty
- Include 1-2 questions about teamwork/collaboration
- Include 1 question about handling challenges/failures
- Make questions specific to {req.role}
- Questions should be conversational, not robotic

Return ONLY the questions, one per line, no numbering."""

        resp = await resume_rag.llm.ainvoke([
            SystemMessage(content="You are an expert interviewer. Generate clear, professional interview questions."),
            HumanMessage(content=prompt)
        ])
        
        questions = [q.strip() for q in resp.content.strip().split('\n') if q.strip() and len(q.strip()) > 10]
        return {"questions": questions[:req.num_questions]}
    except Exception as e:
        print(f"Question generation error: {e}")
        return {"questions": ["Tell me about yourself.", "What are your strengths?", "Why this role?"]}


@router.post("/score-answer")
async def score_answer(req: ScoreAnswerRequest, user=Depends(get_current_user)):
    """Score a candidate's interview answer"""
    try:
        if not resume_rag.llm:
            return {"score": 5, "feedback": "AI scoring unavailable."}

        from langchain_core.messages import HumanMessage, SystemMessage
        
        prompt = f"""Score this interview answer on a scale of 1-10.

Role: {req.role}
Question: "{req.question}"
Answer: "{req.answer}"

Score criteria:
- Relevance to the question (0-3 points)
- Depth and detail (0-3 points)  
- Communication clarity (0-2 points)
- Confidence and professionalism (0-2 points)

If the answer is empty or just noise, score 1.
If the answer is short but relevant, score 4-6.
If the answer is detailed and impressive, score 7-10.

Return in this EXACT format (no markdown):
SCORE: [number 1-10]
FEEDBACK: [one sentence feedback]"""

        resp = await resume_rag.llm.ainvoke([
            SystemMessage(content="You are a fair interview evaluator. Score answers objectively."),
            HumanMessage(content=prompt)
        ])
        
        content = resp.content.strip()
        score = 5
        feedback = "Answer noted."
        
        import re
        score_match = re.search(r'SCORE:\s*(\d+)', content)
        if score_match:
            score = min(10, max(1, int(score_match.group(1))))
        
        feedback_match = re.search(r'FEEDBACK:\s*(.+)', content)
        if feedback_match:
            feedback = feedback_match.group(1).strip()
        
        return {"score": score, "feedback": feedback}
    except Exception as e:
        print(f"Scoring error: {e}")
        return {"score": 5, "feedback": "Could not score this answer."}


@router.post("/interview-report")
async def generate_interview_report(req: InterviewReportRequest, user=Depends(get_current_user)):
    """Generate a comprehensive interview report"""
    try:
        if not resume_rag.llm:
            return {"report": "AI report generation unavailable."}

        from langchain_core.messages import HumanMessage, SystemMessage
        
        qa_pairs = ""
        for i, (q, a, s) in enumerate(zip(req.questions, req.answers, req.scores)):
            score_val = s.get('score', '?') if isinstance(s, dict) else '?'
            feedback = s.get('feedback', '') if isinstance(s, dict) else ''
            qa_pairs += f"\nQ{i+1}: {q}\nAnswer: {a or '(no answer)'}\nScore: {score_val}/10 - {feedback}\n"

        avg_score = sum(s.get('score', 0) if isinstance(s, dict) else 0 for s in req.scores) / max(len(req.scores), 1)
        
        prompt = f"""Generate an interview evaluation report for:

Candidate: {req.candidate_name}
Role: {req.role}
Duration: {req.duration // 60}min {req.duration % 60}sec
Average Score: {avg_score:.1f}/10

Questions & Answers:
{qa_pairs}

Generate a professional report with:
## Interview Summary
Brief overview of performance

## Strengths Demonstrated
What the candidate did well (2-3 points)

## Areas for Improvement  
Constructive feedback (2-3 points, be kind)

## Overall Recommendation
One of: Strong Hire / Hire / Consider / Pass
With explanation

## Suggested Follow-up
1-2 follow-up questions for the next round

Be professional, constructive, and fair. Never be harsh."""

        resp = await resume_rag.llm.ainvoke([
            SystemMessage(content="You are a professional hiring manager writing fair interview evaluations."),
            HumanMessage(content=prompt)
        ])
        
        report = resp.content
        
        # Save results to interview store
        email = req.candidate_email.strip().lower()
        if email in interviews_store:
            interviews_store[email]["status"] = "completed"
            interviews_store[email]["results"] = {
                "report": report,
                "avg_score": round(avg_score, 1),
                "scores": req.scores,
                "duration": req.duration
            }
            _save_interviews_data(interviews_store, candidate_access)
            print(f"📊 Interview results saved for {email}")
        
        return {"report": report}
    except Exception as e:
        print(f"Report generation error: {e}")
        return {"report": "Could not generate report. Please try again."}
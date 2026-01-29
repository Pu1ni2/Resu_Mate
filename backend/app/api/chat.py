# # """Chat API - AI-powered conversation about candidates"""
# # from typing import List, Optional
# # from fastapi import APIRouter, Depends, HTTPException
# # from pydantic import BaseModel
# # from app.services.auth import get_current_user
# # from app.services.resume_rag import resume_rag

# # router = APIRouter(prefix="/chat", tags=["Chat"])

# # # In-memory chat history (use Redis/DB in production)
# # chat_histories = {}

# # class ChatRequest(BaseModel):
# #     message: str
# #     candidate_ids: List[int] = []
# #     conversation_id: Optional[str] = "default"

# # class ChatResponse(BaseModel):
# #     response: str
# #     suggestions: List[str]
# #     conversation_id: str

# # @router.post("/send", response_model=ChatResponse)
# # async def send_message(req: ChatRequest, user = Depends(get_current_user)):
# #     """Send a message to AI assistant"""
# #     conv_id = req.conversation_id or "default"
    
# #     # Get or create chat history
# #     if conv_id not in chat_histories:
# #         chat_histories[conv_id] = []
    
# #     history = chat_histories[conv_id]
    
# #     try:
# #         result = await resume_rag.chat(
# #             message=req.message,
# #             candidate_ids=req.candidate_ids,
# #             conversation_history=history
# #         )
        
# #         # Update history
# #         history.append({"role": "user", "content": req.message})
# #         history.append({"role": "assistant", "content": result["response"]})
        
# #         # Keep last 20 messages
# #         chat_histories[conv_id] = history[-20:]
        
# #         return ChatResponse(
# #             response=result["response"],
# #             suggestions=result.get("suggestions", []),
# #             conversation_id=conv_id
# #         )
        
# #     except Exception as e:
# #         raise HTTPException(500, f"Chat error: {str(e)}")

# # @router.get("/intro")
# # async def get_intro(candidate_count: int = 0, user = Depends(get_current_user)):
# #     """Get intro message"""
# #     return resume_rag.get_intro_message(candidate_count)

# # @router.delete("/clear")
# # async def clear_chat(user = Depends(get_current_user)):
# #     """Clear chat history"""
# #     chat_histories.clear()
# #     return {"message": "Chat history cleared"}
# """Chat API - AI-powered conversation about candidates"""
# from typing import List, Optional
# from fastapi import APIRouter, Depends, HTTPException
# from pydantic import BaseModel
# from app.services.auth import get_current_user
# from app.services.resume_rag import resume_rag

# router = APIRouter(prefix="/chat", tags=["Chat"])

# # In-memory chat history - stores last 20 messages per conversation
# chat_histories = {}

# class ChatRequest(BaseModel):
#     message: str
#     candidate_ids: List[int] = []
#     conversation_id: Optional[str] = "default"

# class ChatResponse(BaseModel):
#     response: str
#     suggestions: List[str]
#     conversation_id: str

# @router.post("/send", response_model=ChatResponse)
# async def send_message(req: ChatRequest, user = Depends(get_current_user)):
#     """Send a message to AI assistant"""
#     conv_id = req.conversation_id or "default"
    
#     # Get or create chat history
#     if conv_id not in chat_histories:
#         chat_histories[conv_id] = []
    
#     history = chat_histories[conv_id]
    
#     try:
#         result = await resume_rag.chat(
#             message=req.message,
#             candidate_ids=req.candidate_ids,
#             conversation_history=history
#         )
        
#         # Update history
#         history.append({"role": "user", "content": req.message})
#         history.append({"role": "assistant", "content": result["response"]})
        
#         # Keep last 20 messages (10 exchanges) for memory
#         chat_histories[conv_id] = history[-20:]
        
#         return ChatResponse(
#             response=result["response"],
#             suggestions=result.get("suggestions", []),
#             conversation_id=conv_id
#         )
        
#     except Exception as e:
#         raise HTTPException(500, f"Chat error: {str(e)}")

# @router.get("/intro")
# async def get_intro(candidate_count: int = 0, user = Depends(get_current_user)):
#     """Get intro message"""
#     return resume_rag.get_intro_message(candidate_count)

# @router.delete("/clear")
# async def clear_chat(user = Depends(get_current_user)):
#     """Clear chat history"""
#     chat_histories.clear()
#     return {"message": "Chat history cleared"}

"""Chat API with Voice Support and Anonymization - FIXED"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

from app.services.auth import get_current_user
from app.services.resume_rag import resume_rag
from app.core.config import settings

router = APIRouter(prefix="/chat", tags=["Chat"])

# Separate chat histories for anonymized and non-anonymized modes
chat_histories = {
    "default": [],
    "default_anon": []
}

# Lazy initialization - don't create client at import time
openai_client = None


def get_openai_client():
    """Get OpenAI client (lazy initialization)"""
    global openai_client
    if openai_client is None and settings.openai_api_key:
        try:
            from openai import OpenAI
            openai_client = OpenAI(api_key=settings.openai_api_key)
        except Exception as e:
            print(f"Failed to initialize OpenAI client: {e}")
    return openai_client


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
    # Use different history for anonymized vs non-anonymized
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
    """Clear chat history for specific mode"""
    for key in list(chat_histories.keys()):
        chat_histories[key] = []
    return {"message": "Chat history cleared"}


# ============ VOICE FEATURES ============

@router.post("/speech-to-text")
async def speech_to_text(audio: UploadFile = File(...), user=Depends(get_current_user)):
    """Convert speech to text using OpenAI Whisper"""
    client = get_openai_client()
    if not client:
        raise HTTPException(500, "OpenAI client not initialized")
    
    try:
        audio_content = await audio.read()
        audio_file = io.BytesIO(audio_content)
        audio_file.name = audio.filename or "audio.webm"
        
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text"
        )
        
        return {"text": transcription}
        
    except Exception as e:
        raise HTTPException(500, f"Speech-to-text error: {str(e)}")


@router.post("/text-to-speech")
async def text_to_speech(req: TTSRequest, user=Depends(get_current_user)):
    """Convert text to speech using OpenAI TTS"""
    client = get_openai_client()
    if not client:
        raise HTTPException(500, "OpenAI client not initialized")
    
    try:
        clean_text = req.text
        clean_text = clean_text.replace("**", "")
        clean_text = clean_text.replace("*", "")
        clean_text = clean_text.replace("#", "")
        clean_text = clean_text.replace("`", "")
        
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
        
    except Exception as e:
        raise HTTPException(500, f"Text-to-speech error: {str(e)}")
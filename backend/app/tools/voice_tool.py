"""Voice Tool — Text-to-Speech and Speech-to-Text via OpenAI"""
import io
from typing import Dict
from app.core.config import settings


class VoiceTool:
    def __init__(self):
        self.client = None
        if settings.openai_api_key:
            try:
                from openai import OpenAI
                self.client = OpenAI(api_key=settings.openai_api_key)
            except:
                pass

    async def text_to_speech(self, text: str, voice: str = "nova") -> bytes:
        """Convert text to speech audio"""
        if not self.client:
            raise ValueError("OpenAI client not initialized")
        response = self.client.audio.speech.create(model="tts-1", voice=voice, input=text[:4096])
        return response.content

    async def speech_to_text(self, audio_data: bytes, filename: str = "audio.webm") -> str:
        """Convert speech audio to text"""
        if not self.client:
            raise ValueError("OpenAI client not initialized")
        audio_file = io.BytesIO(audio_data)
        audio_file.name = filename
        transcript = self.client.audio.transcriptions.create(model="whisper-1", file=audio_file)
        return transcript.text


voice_tool = VoiceTool()

import { useState, useRef, useCallback } from 'react';

export default function useVoice({ apiBase, onTranscribed }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const abortControllerRef = useRef(null);

  const stopSpeaking = useCallback(() => {
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      if (currentAudioRef.current.src) URL.revokeObjectURL(currentAudioRef.current.src);
      currentAudioRef.current = null;
    }
    setSpeakingMsgIndex(null);
    setLoadingMsgIndex(null);
  }, []);

  const speakText = useCallback(async (text, msgIndex) => {
    if (speakingMsgIndex === msgIndex) { stopSpeaking(); return; }
    stopSpeaking();
    setLoadingMsgIndex(msgIndex);
    try {
      abortControllerRef.current = new AbortController();
      let cleanText = text
        .replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s/g, '')
        .replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/•/g, ',').replace(/\n+/g, '. ').trim();
      if (cleanText.length > 4000) cleanText = cleanText.substring(0, 4000) + '...';

      const response = await fetch(`${apiBase}/api/chat/text-to-speech`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer demo-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voice: 'nova' }),
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) throw new Error('TTS failed');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(audioUrl); currentAudioRef.current = null; setSpeakingMsgIndex(null); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); currentAudioRef.current = null; setSpeakingMsgIndex(null); };
      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(msgIndex);
      await audio.play();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('TTS error:', err);
      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(null);
    }
  }, [speakingMsgIndex, stopSpeaking, apiBase]);

  const transcribeAudio = useCallback(async (audioBlob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      const response = await fetch(`${apiBase}/api/chat/speech-to-text`, {
        method: 'POST', headers: { 'Authorization': 'Bearer demo-token' }, body: formData,
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.text && data.text.trim()) onTranscribed?.(data.text);
      else alert('No speech detected.');
    } catch (err) {
      alert('Voice transcription failed: ' + err.message);
    } finally {
      setIsTranscribing(false);
    }
  }, [apiBase, onTranscribed]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Please allow microphone access.');
    }
  }, [transcribeAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return {
    isRecording, isTranscribing, speakingMsgIndex, loadingMsgIndex,
    startRecording, stopRecording, stopSpeaking, speakText,
  };
}

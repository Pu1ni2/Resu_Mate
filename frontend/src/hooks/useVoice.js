import { useState, useRef, useCallback } from 'react';

const MIN_RECORDING_MS = 800;   // discard recordings shorter than this
const MIN_BLOB_BYTES   = 1500;  // discard silent/empty blobs

export default function useVoice({
  apiBase,
  onTranscribed,       // (text: string) => void
  onSpeakingDone,      // () => void  — fires when TTS finishes naturally
  onTranscribeFail,    // (err: string) => void — silent error callback
}) {
  const [isRecording,      setIsRecording]      = useState(false);
  const [isTranscribing,   setIsTranscribing]   = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [loadingMsgIndex,  setLoadingMsgIndex]  = useState(null);

  const mediaRecorderRef   = useRef(null);
  const audioChunksRef     = useRef([]);
  const currentAudioRef    = useRef(null);
  const abortControllerRef = useRef(null);
  const recordingStartRef  = useRef(null);  // timestamp when recording began

  // ── Stop TTS ─────────────────────────────────────────────────────────────────
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

  // ── TTS ───────────────────────────────────────────────────────────────────────
  const speakText = useCallback(async (text, msgIndex) => {
    if (speakingMsgIndex === msgIndex) { stopSpeaking(); return; }
    stopSpeaking();
    setLoadingMsgIndex(msgIndex);
    try {
      abortControllerRef.current = new AbortController();
      let clean = text
        .replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s/g, '')
        .replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/•/g, ',').replace(/\n+/g, '. ').trim();
      if (clean.length > 4000) clean = clean.substring(0, 4000) + '...';

      const response = await fetch(`${apiBase}/api/chat/text-to-speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: clean, voice: 'nova' }),
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) throw new Error('TTS failed');

      const audioBlob = await response.blob();
      const audioUrl  = URL.createObjectURL(audioBlob);
      const audio     = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setSpeakingMsgIndex(null);
        onSpeakingDone?.();   // ← tell Jarvis AI is done speaking → auto-listen
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setSpeakingMsgIndex(null);
        onSpeakingDone?.();
      };

      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(msgIndex);
      await audio.play();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('TTS error:', err);
      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(null);
      // Don't call onSpeakingDone on abort — user interrupted intentionally
    }
  }, [speakingMsgIndex, stopSpeaking, apiBase, onSpeakingDone]);

  // ── STT ───────────────────────────────────────────────────────────────────────
  const transcribeAudio = useCallback(async (audioBlob) => {
    // Guard: discard tiny/silent recordings
    if (audioBlob.size < MIN_BLOB_BYTES) {
      onTranscribeFail?.('too_short');
      return;
    }
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      const response = await fetch(`${apiBase}/api/chat/speech-to-text`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}` },
        body: formData,
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.text && data.text.trim()) {
        onTranscribed?.(data.text.trim());
      } else {
        onTranscribeFail?.('no_speech');
      }
    } catch (err) {
      // Silent fail — no alerts, just log and callback
      console.warn('STT error:', err.message);
      onTranscribeFail?.(err.message);
    } finally {
      setIsTranscribing(false);
    }
  }, [apiBase, onTranscribed, onTranscribeFail]);

  // ── Recording (click-to-toggle, not hold) ────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current   = [];
      recordingStartRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const duration = Date.now() - (recordingStartRef.current || 0);
        stream.getTracks().forEach(t => t.stop());
        if (duration < MIN_RECORDING_MS) {
          onTranscribeFail?.('too_short');
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start(100);   // collect chunks every 100ms
      setIsRecording(true);
    } catch (err) {
      console.error('Mic access denied:', err);
      onTranscribeFail?.('mic_denied');
    }
  }, [transcribeAudio, onTranscribeFail]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Toggle: if recording → stop, if not → start
  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording, isTranscribing, speakingMsgIndex, loadingMsgIndex,
    startRecording, stopRecording, toggleRecording, stopSpeaking, speakText,
  };
}

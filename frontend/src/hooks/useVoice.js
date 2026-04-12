import { useState, useRef, useCallback, useEffect } from 'react';

const MIN_RECORDING_MS = 800;   // discard recordings shorter than this
const MIN_BLOB_BYTES   = 1500;  // discard silent/empty blobs
const SILENCE_RMS_THRESHOLD = 0.014;
const SILENCE_STOP_MS = 1600;

export default function useVoice({
  apiBase,
  onTranscribed,       // (text: string) => void
  onSpeakingDone,      // () => void  — fires when TTS finishes naturally
  onTranscribeFail,    // (err: string) => void — silent error callback
  onAutoStop,          // () => void  — fires when silence detection auto-stops recording
}) {
  const [isRecording,      setIsRecording]      = useState(false);
  const [isTranscribing,   setIsTranscribing]   = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [loadingMsgIndex,  setLoadingMsgIndex]  = useState(null);

  const mediaRecorderRef   = useRef(null);
  const audioChunksRef     = useRef([]);
  const currentAudioRef    = useRef(null);
  const abortControllerRef = useRef(null);
  const recordingStartRef  = useRef(null);
  const speechDetectedRef  = useRef(false);
  const maxRmsRef          = useRef(0);

  // Silence detection refs
  const audioContextRef    = useRef(null);
  const analyserRef        = useRef(null);
  const silenceTimerRef    = useRef(0);
  const silenceIntervalRef = useRef(null);
  const onAutoStopRef      = useRef(null);

  useEffect(() => { onAutoStopRef.current = onAutoStop; }, [onAutoStop]);

  // ── Stop silence detection ────────────────────────────────────────────────────
  const stopSilenceDetection = useCallback(() => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    silenceTimerRef.current = 0;
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch (_) {}
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }
  }, []);

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
        onSpeakingDone?.();
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
      console.warn('STT error:', err.message);
      onTranscribeFail?.(err.message);
    } finally {
      setIsTranscribing(false);
    }
  }, [apiBase, onTranscribed, onTranscribeFail]);

  // ── Silence detection ─────────────────────────────────────────────────────────
  // Must be defined before startRecording so it can be called inside it.
  // Uses a ref to stopRecording to avoid circular dependency.
  const stopRecordingRef = useRef(null);

  const startSilenceDetection = useCallback((stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current     = analyser;
      silenceTimerRef.current = 0;
      speechDetectedRef.current = false;
      maxRmsRef.current = 0;

      const dataArray = new Float32Array(analyser.fftSize);

      silenceIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(dataArray);

        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) sumSq += dataArray[i] ** 2;
        const rms = Math.sqrt(sumSq / dataArray.length);
        maxRmsRef.current = Math.max(maxRmsRef.current, rms);

        if (rms >= SILENCE_RMS_THRESHOLD) {
          speechDetectedRef.current = true;
          silenceTimerRef.current = 0;
        } else {
          silenceTimerRef.current += 200;
          if (silenceTimerRef.current >= SILENCE_STOP_MS) {
            stopSilenceDetection();
            stopRecordingRef.current?.();
            onAutoStopRef.current?.();
          }
        }
      }, 200);
    } catch (err) {
      console.warn('Silence detection unavailable:', err.message);
      // Gracefully degrade — recording works without silence detection
    }
  }, [stopSilenceDetection]);

  // ── Recording ─────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    stopSilenceDetection();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [stopSilenceDetection]);

  // Keep stopRecordingRef in sync for use inside silence detection closure
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,   // prevents speaker audio bleeding into mic
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current  = mediaRecorder;
      audioChunksRef.current    = [];
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
        if (!speechDetectedRef.current && maxRmsRef.current < SILENCE_RMS_THRESHOLD) {
          onTranscribeFail?.('no_speech');
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      startSilenceDetection(stream);   // ← silence detection starts with recording
    } catch (err) {
      console.error('Mic access denied:', err);
      onTranscribeFail?.('mic_denied');
    }
  }, [transcribeAudio, onTranscribeFail, startSilenceDetection]);

  const toggleRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  // ── Unmount cleanup ───────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopSilenceDetection();
      stopSpeaking();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (_) {}
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isRecording, isTranscribing, speakingMsgIndex, loadingMsgIndex,
    startRecording, stopRecording, toggleRecording, stopSpeaking, speakText,
  };
}

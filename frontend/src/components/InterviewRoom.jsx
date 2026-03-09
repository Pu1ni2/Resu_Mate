/**
 * InterviewRoom v3 — Full-screen proctored AI video interview + Simli Avatar
 *
 * Layout: Candidate camera (left) | Simli AI avatar (right)
 * Flow: Technical Agent generates Qs → TTS audio → Simli lip-syncs → Candidate answers → Scoring Agent
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Mic, StopCircle, X, Camera, AlertTriangle, Eye, EyeOff,
  Clock, ChevronRight, Loader, Volume2, Shield, Monitor,
  CheckCircle, XCircle, ArrowRight, Brain, Briefcase
} from 'lucide-react';

const API_BASE = import.meta.env.PROD ? 'https://resumate-2vad.onrender.com' : '';
const FACE_API_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
const MAX_VIOLATIONS = 3;

// ═══ SIMLI CONFIG — Replace with your credentials ═══
const SIMLI_FACE_ID = 'tmp9i8bbq7c'; // Replace with your Face ID from Simli dashboard
// API key will come from env or props

export default function InterviewRoom({ config, candidateName, candidateEmail, onComplete, onExit, simliApiKey }) {
  // ─── Phase & Questions ───
  const [phase, setPhase] = useState('setup'); // setup | countdown | live | finished
  const [currentQ, setCurrentQ] = useState(0);
  const [questions, setQuestions] = useState([]);

  // ─── AI State ───
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');

  // ─── Face Tracking ───
  const [faceDetected, setFaceDetected] = useState(false);
  const [eyeContact, setEyeContact] = useState(0);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [lookAwayCount, setLookAwayCount] = useState(0);
  const eyeContactSamples = useRef([]);

  // ─── Proctoring ───
  const [violations, setViolations] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const [timer, setTimer] = useState(0);

  // ─── Simli State ───
  const [simliReady, setSimliReady] = useState(false);
  const [simliLoading, setSimliLoading] = useState(false);
  const [countdown, setCountdown] = useState(5);

  // ─── Refs ───
  const candidateVideoRef = useRef(null);
  const candidateCanvasRef = useRef(null);
  const simliVideoRef = useRef(null);
  const simliAudioRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const faceDetectionRef = useRef(null);
  const containerRef = useRef(null);
  const violationCountRef = useRef(0);
  const answersRef = useRef([]);
  const scoresRef = useRef([]);
  const simliClientRef = useRef(null);

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ═══ LOAD FACE-API ═══
  useEffect(() => {
    if (window.faceapi) { setFaceApiReady(true); return; }
    const script = document.createElement('script');
    script.src = FACE_API_URL;
    script.onload = async () => {
      try {
        await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
        await window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL);
        setFaceApiReady(true);
      } catch { setFaceApiReady(true); }
    };
    script.onerror = () => setFaceApiReady(true);
    document.head.appendChild(script);
  }, []);

  // ═══ INIT SIMLI ═══
  const initSimli = async () => {
    const apiKey = simliApiKey || import.meta.env.VITE_SIMLI_API_KEY;
    if (!apiKey) { console.warn('⚠️ No Simli API key found'); return false; }

    console.log('🔧 Simli init starting...');
    console.log('  API key:', apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING');
    console.log('  Face ID:', config?.simli_face_id || SIMLI_FACE_ID);
    console.log('  Video ref:', !!simliVideoRef.current);
    console.log('  Audio ref:', !!simliAudioRef.current);

    if (!simliVideoRef.current || !simliAudioRef.current) {
      console.warn('⚠️ Simli video/audio refs not ready, retrying in 1s...');
      await new Promise(r => setTimeout(r, 1000));
      if (!simliVideoRef.current || !simliAudioRef.current) {
        console.error('❌ Simli refs still null after retry');
        return false;
      }
    }

    try {
      // Dynamic import simli-client
      const { SimliClient } = await import('simli-client');
      const client = new SimliClient();
      simliClientRef.current = client;

      const simliConfig = {
        apiKey: apiKey,
        faceID: config?.simli_face_id || SIMLI_FACE_ID,
        handleSilence: true,
        maxSessionLength: 3600,
        maxIdleTime: 600,
        videoRef: simliVideoRef.current,
        audioRef: simliAudioRef.current,
        enableConsoleLogs: true,
      };

      client.Initialize(simliConfig);
      await client.start();
      setSimliReady(true);
      console.log('✅ Simli avatar connected');
      return true;
    } catch (e) {
      console.warn('Simli init failed:', e);
      return false;
    }
  };

  // ═══ VIOLATION HANDLER ═══
  const addViolation = useCallback((msg) => {
    violationCountRef.current += 1;
    const count = violationCountRef.current;
    setViolations(count);
    setWarnings(prev => [...prev, { msg: `VIOLATION ${count}/${MAX_VIOLATIONS}: ${msg}`, time: Date.now() }]);
    setTimeout(() => setWarnings(prev => prev.slice(1)), 5000);
    if (count >= MAX_VIOLATIONS) { setTerminated(true); terminateInterview(); }
  }, []);

  // ═══ TAB DETECTION ═══
  useEffect(() => {
    if (phase !== 'live') return;
    const onHidden = () => { if (document.hidden) addViolation('Tab switch detected'); };
    const onBlur = () => addViolation('Another window/app opened');
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onBlur);
    return () => { document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('blur', onBlur); };
  }, [phase, addViolation]);

  // ═══ FULLSCREEN ═══
  const enterFullscreen = async () => {
    try {
      const el = containerRef.current || document.documentElement;
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      setIsFullscreen(true);
    } catch {}
  };

  useEffect(() => {
    const handler = () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull && phase === 'live') addViolation('Exited fullscreen mode');
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => { document.removeEventListener('fullscreenchange', handler); document.removeEventListener('webkitfullscreenchange', handler); };
  }, [phase, addViolation]);

  // ═══ TIMER ═══
  useEffect(() => {
    if (phase === 'live') timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ═══ VIDEO REF CALLBACK (fixes blank video) ═══
  const candidateVideoCallback = useCallback((node) => {
    candidateVideoRef.current = node;
    if (node && streamRef.current) { node.srcObject = streamRef.current; node.play().catch(() => {}); }
  }, []);

  // ═══ FACE DETECTION ═══
  useEffect(() => {
    if (phase !== 'live' || !faceApiReady || !window.faceapi) return;
    const detect = async () => {
      const video = candidateVideoRef.current;
      if (!video || video.paused || video.readyState < 2) return;
      try {
        const detections = await window.faceapi
          .detectAllFaces(video, new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
          .withFaceLandmarks(true);
        const canvas = candidateCanvasRef.current;
        if (canvas) {
          const dw = video.clientWidth || 640, dh = video.clientHeight || 480;
          canvas.width = dw; canvas.height = dh;
          const resized = window.faceapi.resizeResults(detections, { width: dw, height: dh });
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, dw, dh);
          resized.forEach(det => {
            const box = det.detection.box;
            ctx.strokeStyle = '#22C55E'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            ctx.setLineDash([]);
            [det.landmarks.getLeftEye(), det.landmarks.getRightEye()].forEach(eye => {
              ctx.beginPath();
              eye.forEach((pt, i) => { i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y); });
              ctx.closePath(); ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 1.5; ctx.stroke();
            });
            ctx.fillStyle = '#22C55E'; ctx.font = '11px sans-serif';
            ctx.fillText(`${Math.round(det.detection.score * 100)}%`, box.x, box.y - 5);
          });
          if (detections.length > 0) {
            setFaceDetected(true);
            const face = detections[0].detection.box;
            const offset = Math.abs((face.x + face.width / 2) - dw / 2) / (dw / 2);
            const contact = Math.max(0, 1 - offset * 2);
            eyeContactSamples.current.push(contact > 0.4 ? 1 : 0);
            if (eyeContactSamples.current.length > 60) eyeContactSamples.current.shift();
            setEyeContact(Math.round(eyeContactSamples.current.reduce((a, b) => a + b, 0) / eyeContactSamples.current.length * 100));
            if (contact < 0.2) setLookAwayCount(prev => prev + 1);
          } else { setFaceDetected(false); }
        }
      } catch {}
    };
    faceDetectionRef.current = setInterval(detect, 600);
    return () => { if (faceDetectionRef.current) clearInterval(faceDetectionRef.current); };
  }, [phase, faceApiReady]);

  // ═══ CAMERA ═══
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      if (candidateVideoRef.current) { candidateVideoRef.current.srcObject = stream; candidateVideoRef.current.play().catch(() => {}); }
      return true;
    } catch { alert('Camera and microphone required.'); return false; }
  };

  const stopAll = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (faceDetectionRef.current) clearInterval(faceDetectionRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (simliClientRef.current) { try { simliClientRef.current.close(); } catch {} }
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  };

  useEffect(() => () => stopAll(), []);

  // ═══ TTS → SIMLI (send audio to avatar) ═══
  const speakQuestion = async (text) => {
    setAiSpeaking(true);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/text-to-speech`, {
        method: 'POST', headers: { 'Authorization': 'Bearer demo-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' })
      });
      if (!resp.ok) throw new Error();

      // Get raw audio bytes
      const arrayBuffer = await resp.arrayBuffer();

      // Send to Simli if connected
      if (simliClientRef.current && simliReady) {
        try {
          // Convert to PCM16 for Simli
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
          const pcm = decoded.getChannelData(0);
          const pcm16 = new Int16Array(pcm.length);
          for (let i = 0; i < pcm.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
          }
          simliClientRef.current.sendAudioData(new Uint8Array(pcm16.buffer));
          console.log('🎤 Audio sent to Simli avatar');
        } catch (e) {
          console.warn('Simli audio send failed:', e);
        }
      }

      // Also play audio locally as fallback / for candidate to hear
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const audio = new Audio(URL.createObjectURL(blob));

      return new Promise(r => {
        audio.onended = () => { setAiSpeaking(false); r(); };
        audio.onerror = () => { setAiSpeaking(false); r(); };
        audio.play();
      });
    } catch { setAiSpeaking(false); }
  };

  // ═══ RECORDING ═══
  const startRecording = () => {
    if (!streamRef.current) return;
    setIsListening(true); setCurrentTranscript(''); audioChunksRef.current = [];
    const audioStream = new MediaStream(streamRef.current.getAudioTracks());
    const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    recorder.start();
  };

  const stopAndTranscribe = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return Promise.resolve('');
    setIsListening(false); setIsTranscribing(true);
    return new Promise(resolve => {
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        try {
          const form = new FormData(); form.append('audio', blob, 'a.webm');
          const resp = await fetch(`${API_BASE}/api/chat/speech-to-text`, { method: 'POST', headers: { 'Authorization': 'Bearer demo-token' }, body: form });
          const data = await resp.json();
          setCurrentTranscript(data.text || ''); setIsTranscribing(false); resolve(data.text || '');
        } catch { setIsTranscribing(false); resolve(''); }
      };
      mediaRecorderRef.current.stop();
    });
  };

  // ═══ SCORING ═══
  const scoreAnswer = async (q, a) => {
    setIsScoring(true);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/score-answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ question: q, answer: a, role: config?.role || 'General', candidate_name: candidateName })
      });
      const data = await resp.json(); setIsScoring(false); return data;
    } catch { setIsScoring(false); return { score: 5, feedback: 'Could not score.' }; }
  };

  // ═══ INTERVIEW FLOW ═══
  const startInterview = async () => {
    if (!(await startCamera())) return;
    await enterFullscreen();

    // Countdown
    setPhase('countdown');
    for (let i = 5; i >= 1; i--) { setCountdown(i); await new Promise(r => setTimeout(r, 1000)); }

    setPhase('live'); setTimer(0);

    // Init Simli AFTER phase is live (so video refs are mounted)
    setTimeout(async () => {
      setSimliLoading(true);
      await initSimli();
      setSimliLoading(false);
    }, 500);

    // Generate questions from Technical Agent
    try {
      const resp = await fetch(`${API_BASE}/api/chat/generate-interview-questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ role: config?.role || 'General', level: config?.level || 'Mid-Level', num_questions: config?.num_questions || 8, focus_areas: config?.focus_areas || [], candidate_name: candidateName })
      });
      const data = await resp.json();
      const qs = data.questions || ['Tell me about yourself.'];
      setQuestions(qs); setCurrentQ(0);
      await new Promise(r => setTimeout(r, 800));
      await speakQuestion(qs[0]); // Avatar speaks first question
    } catch { setQuestions(['Tell me about yourself.']); setCurrentQ(0); }
  };

  const submitAnswer = async () => {
    const text = await stopAndTranscribe();
    answersRef.current = [...answersRef.current, text];
    const s = await scoreAnswer(questions[currentQ], text);
    scoresRef.current = [...scoresRef.current, s];
    setCurrentTranscript('');
    if (currentQ + 1 < questions.length) {
      setCurrentQ(prev => prev + 1);
      await new Promise(r => setTimeout(r, 500));
      await speakQuestion(questions[currentQ + 1]); // Avatar speaks next question
    } else { await generateReport(false); }
  };

  const terminateInterview = async () => { stopAll(); await generateReport(true); };

  const generateReport = async (violated) => {
    stopAll(); setPhase('finished');
    const finalScores = scoresRef.current;
    const finalAnswers = answersRef.current;
    try {
      const resp = await fetch(`${API_BASE}/api/chat/interview-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ candidate_name: candidateName, candidate_email: candidateEmail, role: config?.role || 'General', questions, answers: finalAnswers, scores: finalScores, duration: timer })
      });
      const data = await resp.json();
      let r = data.report || 'Report generated.';
      if (violated) r = `## Interview Terminated\n\nAutomatically terminated after ${MAX_VIOLATIONS} proctoring violations.\n\n---\n\n` + r;
      if (onComplete) onComplete({ report: r, scores: finalScores, violations: violationCountRef.current, eyeContact, timer, terminated: violated, avgScore: finalScores.length > 0 ? parseFloat((finalScores.reduce((a, s) => a + (s.score || 0), 0) / finalScores.length).toFixed(1)) : 0, lookAwayCount });
    } catch {
      if (onComplete) onComplete({ report: 'Report generation failed.', scores: finalScores, violations: violationCountRef.current, eyeContact, timer, terminated: violated, avgScore: 0, lookAwayCount });
    }
  };

  // ═══ RENDER ═══
  return (
    <div className="ir-container" ref={containerRef} style={{ background: '#0A0A0F', color: '#F4F4F5', position: 'fixed', inset: 0, zIndex: 9999, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ═══ SETUP ═══ */}
      {phase === 'setup' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px', background: 'linear-gradient(135deg, #0A0A0F, #111128)' }}>
          <div style={{ maxWidth: '560px', width: '100%', padding: '48px', background: 'rgba(14,14,22,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', textAlign: 'center' }}>
            {/* AI Face preview */}
            <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '3px solid rgba(59,130,246,0.3)' }}>
              <Bot size={40} color="#fff" />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>AI Interview Room</h1>
            <p style={{ color: '#71717A', marginBottom: '24px' }}>Live AI avatar interview with face tracking and real-time scoring.</p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {config?.role && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '13px', color: '#A1A1AA' }}><Briefcase size={14} /> {config.role}</span>}
              {config?.num_questions && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '13px', color: '#A1A1AA' }}><Clock size={14} /> {config.num_questions} Qs</span>}
            </div>

            <div style={{ textAlign: 'left', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '24px' }}>
              <p style={{ fontSize: '13px', color: '#F59E0B', fontWeight: '600', marginBottom: '10px' }}>Strict Proctoring — {MAX_VIOLATIONS} violations = auto-termination</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {['Camera + mic active', 'AI avatar asks questions live', 'Face & eye tracking enabled', 'Tab switching = violation', 'Fullscreen required'].map(rule => (
                  <span key={rule} style={{ fontSize: '12px', color: '#71717A', display: 'flex', alignItems: 'center', gap: '8px' }}><Shield size={12} /> {rule}</span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={onExit} style={{ padding: '14px 24px', background: 'none', color: '#71717A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={startInterview} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Camera size={18} /> Start Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ COUNTDOWN ═══ */}
      {phase === 'countdown' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          {simliLoading && <p style={{ color: '#3B82F6', marginBottom: '20px', fontSize: '14px' }}>Connecting AI avatar...</p>}
          <div style={{ fontSize: '140px', fontWeight: '900', color: '#3B82F6', lineHeight: 1 }}>{countdown}</div>
          <p style={{ color: '#71717A', marginTop: '12px' }}>Get ready...</p>
        </div>
      )}

      {/* ═══ LIVE INTERVIEW ═══ */}
      {phase === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ background: '#EF4444', color: '#fff', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>● REC</span>
              <span style={{ background: 'rgba(255,255,255,0.1)', padding: '6px 14px', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace' }}>{formatTime(timer)}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '600' }}>Question {currentQ + 1} / {questions.length}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', background: faceDetected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: faceDetected ? '#22C55E' : '#EF4444' }}>
                {faceDetected ? <Eye size={13} /> : <EyeOff size={13} />} {faceDetected ? `${eyeContact}%` : 'No face'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', background: violations > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: violations > 0 ? '#F87171' : '#71717A' }}>
                <Shield size={12} /> {violations}/{MAX_VIOLATIONS}
              </span>
            </div>
          </div>

          {/* Video area — side by side */}
          <div style={{ flex: 1, display: 'flex', gap: '2px', background: '#000', position: 'relative' }}>
            {/* Candidate camera (left) */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <video ref={candidateVideoCallback} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              <canvas ref={candidateCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>You</div>
            </div>

            {/* AI Avatar (right) */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#111' }}>
              {/* Simli video element */}
              <video ref={simliVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: simliReady ? 'block' : 'none' }} />
              <audio ref={simliAudioRef} autoPlay style={{ display: 'none' }} />

              {/* Fallback if Simli not connected */}
              {!simliReady && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0F172A, #1E293B)' }}>
                  <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <Bot size={50} color="#fff" />
                  </div>
                  <p style={{ fontSize: '14px', color: '#94A3B8' }}>AI Interviewer</p>
                  {aiSpeaking && <p style={{ fontSize: '12px', color: '#3B82F6', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Volume2 size={14} /> Speaking...</p>}
                </div>
              )}

              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Bot size={12} /> Alex (AI) {aiSpeaking && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E', animation: 'irPulse 1.5s infinite' }} />}
              </div>
            </div>

            {/* Warnings overlay */}
            {warnings.length > 0 && (
              <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(239,68,68,0.9)', color: '#fff', borderRadius: '10px', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    <AlertTriangle size={14} /> {w.msg}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom panel */}
          <div style={{ background: '#111118', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px' }}>
            {/* Question */}
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#71717A' }}>Question {currentQ + 1}</span>
              <p style={{ fontSize: '15px', marginTop: '4px', color: '#E4E4E7', lineHeight: '1.5' }}>{questions[currentQ] || 'Preparing...'}</p>
            </div>

            {/* Status + Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isListening && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#3B82F6', fontSize: '13px' }}><Mic size={14} /> Listening...</span>}
                {isTranscribing && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#A1A1AA', fontSize: '13px' }}><Loader size={14} className="spin" /> Transcribing...</span>}
                {isScoring && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#F59E0B', fontSize: '13px' }}><Brain size={14} /> Scoring...</span>}
                {aiSpeaking && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#3B82F6', fontSize: '13px' }}><Volume2 size={14} /> AI speaking...</span>}
                {currentTranscript && <span style={{ fontSize: '12px', color: '#71717A', fontStyle: 'italic', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{currentTranscript}"</span>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Score pills */}
                {scoresRef.current.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {scoresRef.current.map((s, i) => (
                      <span key={i} style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                        background: (s.score || 0) >= 7 ? 'rgba(34,197,94,0.1)' : (s.score || 0) >= 4 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                        color: (s.score || 0) >= 7 ? '#22C55E' : (s.score || 0) >= 4 ? '#F59E0B' : '#EF4444' }}>
                        Q{i + 1}:{s.score}
                      </span>
                    ))}
                  </div>
                )}

                {/* Main action button */}
                {!isListening && !isTranscribing && !aiSpeaking && !isScoring && (
                  <button onClick={startRecording} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Mic size={18} /> Answer
                  </button>
                )}
                {isListening && (
                  <button onClick={submitAnswer} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <StopCircle size={18} /> Done
                  </button>
                )}
                {(isTranscribing || isScoring || aiSpeaking) && (
                  <button disabled style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#1E293B', color: '#71717A', border: 'none', borderRadius: '12px', fontSize: '14px', fontFamily: 'inherit' }}>
                    <Loader size={16} className="spin" /> Wait...
                  </button>
                )}

                <button onClick={() => generateReport(false)} style={{ padding: '10px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#71717A', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <X size={12} /> End
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FINISHED (generating) ═══ */}
      {phase === 'finished' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <Loader size={40} className="spin" style={{ color: '#3B82F6', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '22px' }}>Generating Report...</h2>
          <p style={{ color: '#71717A', marginTop: '8px' }}>Redirecting to dashboard...</p>
        </div>
      )}
    </div>
  );
}
/**
 * InterviewRoom v2 — Full-screen proctored AI video interview.
 * 
 * Fixed: Video display, AI avatar animation, strict 3-violation termination
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Mic, StopCircle, X, Camera, AlertTriangle, Eye, EyeOff,
  Clock, ChevronRight, Loader, Volume2, Shield, Monitor,
  CheckCircle, XCircle, ArrowRight, Brain, Briefcase
} from 'lucide-react';
import { marked } from 'marked';

const API_BASE = import.meta.env.PROD ? 'https://resumate-2vad.onrender.com' : '';
const FACE_API_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
const MAX_VIOLATIONS = 3;

// ─── Animated AI Avatar ───
const AIFace = ({ speaking, mood }) => (
  <div className={`ir-ai-face ${speaking ? 'speaking' : ''} ${mood || ''}`}>
    <div className="ir-ai-face-inner">
      <div className="ir-ai-eyes">
        <div className="ir-ai-eye"><div className="ir-ai-pupil" /></div>
        <div className="ir-ai-eye"><div className="ir-ai-pupil" /></div>
      </div>
      <div className={`ir-ai-mouth ${speaking ? 'talking' : ''}`} />
    </div>
    <div className="ir-ai-ring" />
    {speaking && <div className="ir-ai-ring pulse" />}
  </div>
);

export default function InterviewRoom({ config, candidateName, candidateEmail, onComplete, onExit }) {
  const [phase, setPhase] = useState('setup');
  const [currentQ, setCurrentQ] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [scores, setScores] = useState([]);
  const [timer, setTimer] = useState(0);
  const [countdown, setCountdown] = useState(5);

  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [aiMood, setAiMood] = useState('neutral'); // neutral, thinking, happy

  const [faceDetected, setFaceDetected] = useState(false);
  const [eyeContact, setEyeContact] = useState(0);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [lookAwayCount, setLookAwayCount] = useState(0);
  const eyeContactSamples = useRef([]);

  const [violations, setViolations] = useState(0);
  const [warnings, setWarnings] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminated, setTerminated] = useState(false);

  const [report, setReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const currentAudioRef = useRef(null);
  const faceDetectionRef = useRef(null);
  const containerRef = useRef(null);
  const violationCountRef = useRef(0);

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ═══ Load face-api ═══
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

  // ═══ VIOLATION HANDLER — strict 3-strike termination ═══
  const addViolation = useCallback((msg) => {
    violationCountRef.current += 1;
    const count = violationCountRef.current;
    setViolations(count);
    setWarnings(prev => [...prev, { msg: `⚠️ VIOLATION ${count}/${MAX_VIOLATIONS}: ${msg}`, time: Date.now() }]);
    setTimeout(() => setWarnings(prev => prev.slice(1)), 5000);

    if (count >= MAX_VIOLATIONS) {
      setTerminated(true);
      terminateInterview();
    }
  }, []);

  // ═══ Tab switch detection ═══
  useEffect(() => {
    if (phase !== 'live') return;
    const onHidden = () => { if (document.hidden) addViolation('Tab switch detected'); };
    const onBlur = () => addViolation('Another window/app opened');
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onBlur);
    return () => { document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('blur', onBlur); };
  }, [phase, addViolation]);

  // ═══ Fullscreen ═══
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

  // ═══ Timer ═══
  useEffect(() => {
    if (phase === 'live') timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ═══ VIDEO SYNC — ensure video shows after phase change ═══
  useEffect(() => {
    if (phase === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  // Additional sync on video element mount
  const videoRefCallback = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  // ═══ Face detection ═══
  useEffect(() => {
    if (phase !== 'live' || !faceApiReady || !window.faceapi) return;
    const detect = async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.readyState < 2) return;
      try {
        const detections = await window.faceapi
          .detectAllFaces(video, new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
          .withFaceLandmarks(true);

        const canvas = canvasRef.current;
        if (canvas) {
          const displayW = video.clientWidth || video.offsetWidth || 640;
          const displayH = video.clientHeight || video.offsetHeight || 480;
          canvas.width = displayW;
          canvas.height = displayH;
          
          const dims = { width: displayW, height: displayH };
          const resized = window.faceapi.resizeResults(detections, dims);
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          resized.forEach(det => {
            const box = det.detection.box;
            ctx.strokeStyle = '#22C55E';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            ctx.setLineDash([]);

            // Eye landmarks
            const lm = det.landmarks;
            [lm.getLeftEye(), lm.getRightEye()].forEach(eye => {
              ctx.beginPath();
              eye.forEach((pt, i) => { i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y); });
              ctx.closePath();
              ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 1.5; ctx.stroke();
            });

            // Label
            ctx.fillStyle = '#22C55E'; ctx.font = '12px sans-serif';
            ctx.fillText(`Face ${Math.round(det.detection.score * 100)}%`, box.x, box.y - 6);
          });

          if (detections.length > 0) {
            setFaceDetected(true);
            const face = detections[0].detection.box;
            const vcx = dims.width / 2;
            const fcx = face.x + face.width / 2;
            const offset = Math.abs(fcx - vcx) / (dims.width / 2);
            const contact = Math.max(0, 1 - offset * 2);
            eyeContactSamples.current.push(contact > 0.4 ? 1 : 0);
            if (eyeContactSamples.current.length > 60) eyeContactSamples.current.shift();
            setEyeContact(Math.round(eyeContactSamples.current.reduce((a, b) => a + b, 0) / eyeContactSamples.current.length * 100));
            if (contact < 0.2) setLookAwayCount(prev => prev + 1);
          } else {
            setFaceDetected(false);
          }
        }
      } catch {}
    };
    faceDetectionRef.current = setInterval(detect, 600);
    return () => { if (faceDetectionRef.current) clearInterval(faceDetectionRef.current); };
  }, [phase, faceApiReady]);

  // ═══ Camera ═══
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      return true;
    } catch { alert('Camera and microphone access required.'); return false; }
  };

  const stopAll = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (faceDetectionRef.current) clearInterval(faceDetectionRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  };

  useEffect(() => () => stopAll(), []);

  // ═══ TTS ═══
  const speakQuestion = async (text) => {
    setAiSpeaking(true); setAiMood('speaking');
    try {
      const resp = await fetch(`${API_BASE}/api/chat/text-to-speech`, {
        method: 'POST', headers: { 'Authorization': 'Bearer demo-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' })
      });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      currentAudioRef.current = audio;
      return new Promise(r => {
        audio.onended = () => { currentAudioRef.current = null; setAiSpeaking(false); setAiMood('neutral'); r(); };
        audio.onerror = () => { setAiSpeaking(false); setAiMood('neutral'); r(); };
        audio.play();
      });
    } catch { setAiSpeaking(false); setAiMood('neutral'); }
  };

  // ═══ Recording ═══
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

  // ═══ Scoring ═══
  const scoreAnswer = async (q, a) => {
    setIsScoring(true); setAiMood('thinking');
    try {
      const resp = await fetch(`${API_BASE}/api/chat/score-answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ question: q, answer: a, role: config?.role || 'General', candidate_name: candidateName })
      });
      const data = await resp.json(); setIsScoring(false); setAiMood('neutral'); return data;
    } catch { setIsScoring(false); setAiMood('neutral'); return { score: 5, feedback: 'Could not score.' }; }
  };

  // ═══ Interview flow ═══
  const startInterview = async () => {
    if (!(await startCamera())) return;
    await enterFullscreen();
    setPhase('countdown');
    for (let i = 5; i >= 1; i--) { setCountdown(i); await new Promise(r => setTimeout(r, 1000)); }
    setPhase('live'); setTimer(0);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/generate-interview-questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ role: config?.role || 'General', level: config?.level || 'Mid-Level', num_questions: config?.num_questions || 8, focus_areas: config?.focus_areas || [], candidate_name: candidateName })
      });
      const data = await resp.json(); const qs = data.questions || ['Tell me about yourself.'];
      setQuestions(qs); setCurrentQ(0);
      await new Promise(r => setTimeout(r, 800));
      await speakQuestion(qs[0]);
    } catch { setQuestions(['Tell me about yourself.']); setCurrentQ(0); }
  };

  // Track answers and scores in refs for reliable access in generateReport
  const answersRef = useRef([]);
  const scoresRef = useRef([]);

  const submitAnswer = async () => {
    const text = await stopAndTranscribe();
    answersRef.current = [...answersRef.current, text];
    setAnswers(answersRef.current);
    
    const s = await scoreAnswer(questions[currentQ], text);
    scoresRef.current = [...scoresRef.current, s];
    setScores(scoresRef.current);
    setCurrentTranscript('');
    
    if (currentQ + 1 < questions.length) { 
      setCurrentQ(prev => prev + 1); 
      await new Promise(r => setTimeout(r, 500)); 
      await speakQuestion(questions[currentQ + 1]); 
    } else { 
      await generateReport(false); 
    }
  };

  const terminateInterview = async () => {
    stopAll(); setPhase('finished'); await generateReport(true);
  };

  const generateReport = async (violated) => {
    stopAll(); setPhase('finished'); setGeneratingReport(true);
    
    const finalAnswers = answersRef.current;
    const finalScores = scoresRef.current;
    const finalViolations = violationCountRef.current;
    const finalTimer = timer;
    const finalEyeContact = eyeContact;
    const finalLookAway = lookAwayCount;
    
    try {
      const resp = await fetch(`${API_BASE}/api/chat/interview-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ 
          candidate_name: candidateName, candidate_email: candidateEmail, 
          role: config?.role || 'General', questions, 
          answers: finalAnswers, scores: finalScores, duration: finalTimer 
        })
      });
      const data = await resp.json();
      let r = data.report || 'Report generated.';
      if (violated) r = `## ⚠️ INTERVIEW TERMINATED\n\nAutomatically terminated after ${MAX_VIOLATIONS} proctoring violations.\n\n---\n\n` + r;
      
      setGeneratingReport(false);
      const reportData = {
        report: r, 
        scores: finalScores, 
        violations: finalViolations,
        eyeContact: finalEyeContact, 
        timer: finalTimer, 
        terminated: violated,
        avgScore: finalScores.length > 0 ? parseFloat((finalScores.reduce((a, s) => a + (s.score || 0), 0) / finalScores.length).toFixed(1)) : 0,
        lookAwayCount: finalLookAway
      };
      
      if (onComplete) onComplete(reportData);
      else if (onExit) onExit();
    } catch (e) {
      console.error('Report generation failed:', e);
      setGeneratingReport(false);
      const reportData = { 
        report: 'Report generation failed. Your answers were recorded.', 
        scores: finalScores, violations: finalViolations, 
        eyeContact: finalEyeContact, timer: finalTimer, 
        terminated: violated, avgScore: 0, lookAwayCount: finalLookAway 
      };
      if (onComplete) onComplete(reportData);
      else if (onExit) onExit();
    }
  };

  const avgScore = scores.length > 0 ? (scores.reduce((a, s) => a + (s.score || 0), 0) / scores.length).toFixed(1) : '—';

  // ═══ RENDER ═══
  console.log('🎥 InterviewRoom rendering. Phase:', phase, 'Config:', config);
  
  return (
    <div className="ir-container" ref={containerRef} style={{ background: '#0A0A0F', color: '#F4F4F5', position: 'fixed', inset: 0, zIndex: 9999 }}>

      {/* SETUP */}
      {phase === 'setup' && (
        <div className="ir-setup" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px', background: 'linear-gradient(135deg, #0A0A0F, #111128)' }}>
          <div className="ir-setup-card" style={{ maxWidth: '560px', width: '100%', padding: '48px', background: 'rgba(14,14,22,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', textAlign: 'center' }}>
            <AIFace speaking={false} mood="neutral" />
            <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px', color: '#F4F4F5' }}>AI Interview Room</h1>
            <p style={{ color: '#71717A', marginBottom: '24px' }}>Proctored interview with face tracking and real-time AI scoring.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
              {config?.role && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '13px', color: '#A1A1AA' }}><Briefcase size={14} /> {config.role}</span>}
              {config?.num_questions && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '13px', color: '#A1A1AA' }}><Clock size={14} /> {config.num_questions} questions</span>}
              {config?.level && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '13px', color: '#A1A1AA' }}><Shield size={14} /> {config.level}</span>}
            </div>
            <div style={{ textAlign: 'left', padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px', color: '#F59E0B' }}>⚠️ Strict Proctoring — {MAX_VIOLATIONS} Violations = Auto-Termination</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '13px', color: '#A1A1AA' }}><Camera size={14} /> Camera + mic active throughout</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '13px', color: '#A1A1AA' }}><Eye size={14} /> Face detection + eye tracking enabled</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '13px', color: '#A1A1AA' }}><Monitor size={14} /> Tab/window switching = 1 violation</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '13px', color: '#A1A1AA' }}><Shield size={14} /> Exiting fullscreen = 1 violation</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '13px', color: '#A1A1AA' }}><AlertTriangle size={14} /> {MAX_VIOLATIONS} violations → interview terminates</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={onExit} style={{ padding: '14px 24px', background: 'none', color: '#71717A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={startInterview} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}><Camera size={18} /> Start Interview</button>
            </div>
          </div>
        </div>
      )}

      {/* COUNTDOWN */}
      {phase === 'countdown' && (
        <div className="ir-countdown">
          <div className="ir-countdown-num">{countdown}</div>
          <p>Camera activating...</p>
        </div>
      )}

      {/* LIVE */}
      {phase === 'live' && (
        <div className="ir-live">
          <div className="ir-video-area">
            <video ref={videoRefCallback} autoPlay muted playsInline className="ir-video" />
            <canvas ref={canvasRef} className="ir-canvas" />

            <div className="ir-topbar">
              <div className="ir-topbar-left">
                <span className="ir-live-badge">● REC</span>
                <span className="ir-timer">{formatTime(timer)}</span>
              </div>
              <div className="ir-topbar-center">
                <span className="ir-q-indicator">Question {currentQ + 1} / {questions.length}</span>
              </div>
              <div className="ir-topbar-right">
                <span className={`ir-face-status ${faceDetected ? 'ok' : 'warn'}`}>
                  {faceDetected ? <Eye size={14} /> : <EyeOff size={14} />} {faceDetected ? `${eyeContact}%` : 'No face'}
                </span>
                <span className={`ir-violation-counter ${violations > 0 ? 'active' : ''}`}>
                  <Shield size={12} /> {violations}/{MAX_VIOLATIONS}
                </span>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="ir-warnings">{warnings.map((w, i) => (
                <div key={i} className="ir-warning-toast"><AlertTriangle size={16} /> {w.msg}</div>
              ))}</div>
            )}
          </div>

          {/* Side panel with AI face */}
          <div className="ir-panel">
            <div className="ir-panel-ai">
              <AIFace speaking={aiSpeaking} mood={aiMood} />
              <div className="ir-panel-ai-info">
                <strong>AI Interviewer</strong>
                <span>{aiSpeaking ? '🔊 Speaking...' : isScoring ? '🤔 Thinking...' : 'Listening'}</span>
              </div>
            </div>

            <div className="ir-question">
              <span className="ir-q-label">Question {currentQ + 1}</span>
              <p>{questions[currentQ] || 'Preparing...'}</p>
            </div>

            <div className="ir-status-area">
              {isListening && (<div className="ir-status listening"><div className="ir-wave"><span /><span /><span /><span /><span /></div><span>Listening...</span></div>)}
              {isTranscribing && (<div className="ir-status"><Loader size={14} className="spin" /> Transcribing...</div>)}
              {isScoring && (<div className="ir-status"><Brain size={14} /> Scoring...</div>)}
              {currentTranscript && (<div className="ir-transcript"><p>"{currentTranscript}"</p></div>)}
            </div>

            <div className="ir-controls">
              {!isListening && !isTranscribing && !aiSpeaking && !isScoring && (
                <button className="ir-btn-record" onClick={startRecording}><Mic size={22} /> Answer</button>
              )}
              {isListening && (
                <button className="ir-btn-stop" onClick={submitAnswer}><StopCircle size={22} /> Done</button>
              )}
              {(isTranscribing || isScoring || aiSpeaking) && (
                <button className="ir-btn-disabled" disabled><Loader size={18} className="spin" /> Processing...</button>
              )}
            </div>

            {scores.length > 0 && (
              <div className="ir-score-history">{scores.map((s, i) => (
                <div key={i} className={`ir-score-item ${s.score >= 7 ? 'good' : s.score >= 4 ? 'ok' : 'low'}`}>
                  <span>Q{i + 1}</span><span>{s.score}/10</span>
                </div>
              ))}</div>
            )}

            <button className="ir-btn-end" onClick={() => generateReport(false)}><X size={14} /> End Early</button>
          </div>
        </div>
      )}

      {/* FINISHED — just shows generating state, then exits to dashboard */}
      {phase === 'finished' && (
        <div className="ir-finished">
          <div className="ir-generating">
            <AIFace speaking={false} mood="thinking" />
            <h2>Generating Your Report...</h2>
            <p>AI is analyzing your answers. You'll be redirected to your dashboard.</p>
            <Loader size={24} className="spin" style={{ marginTop: '16px', color: '#3B82F6' }} />
          </div>
        </div>
      )}
    </div>
  );
}
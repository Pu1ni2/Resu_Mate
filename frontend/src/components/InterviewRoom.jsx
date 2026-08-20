/**
 * InterviewRoom v4 — LiveKit + Simli Avatar Interview
 *
 * The AI interviewer (Simli avatar) joins as a real participant in a LiveKit room.
 * Candidate's camera shows on the left, avatar video on the right.
 * Face tracking + proctoring runs on the frontend.
 * Scoring happens on the backend after interview ends.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Mic, MicOff, AlertTriangle, Eye, EyeOff,
  Clock, Loader, Shield, Briefcase,
  Phone, PhoneOff
} from 'lucide-react';
import { interviewAuthHeaders } from '../services/authFetch';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';
const FACE_API_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
const MAX_VIOLATIONS = 3;

export default function InterviewRoom({ config, candidateName, candidateEmail, onComplete, onExit }) {
  const [phase, setPhase] = useState('setup'); // setup | connecting | live | ended
  const [timer, setTimer] = useState(0);

  // LiveKit state
  const [agentJoined, setAgentJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [setupError, setSetupError] = useState(null);

  // Face tracking
  const [faceDetected, setFaceDetected] = useState(false);
  const [eyeContact, setEyeContact] = useState(0);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [lookAwayCount, setLookAwayCount] = useState(0);
  const eyeContactSamples = useRef([]);

  // Proctoring
  const [violations, setViolations] = useState(0);
  const [warnings, setWarnings] = useState([]);

  // Refs
  const candidateVideoRef = useRef(null);
  const candidateCanvasRef = useRef(null);
  const avatarVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const faceDetectionRef = useRef(null);
  const containerRef = useRef(null);
  const violationCountRef = useRef(0);
  const roomRef = useRef(null);

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

  // ═══ VIOLATION HANDLER ═══
  const addViolation = useCallback((msg) => {
    violationCountRef.current += 1;
    const count = violationCountRef.current;
    setViolations(count);
    setWarnings(prev => [...prev, { msg: `VIOLATION ${count}/${MAX_VIOLATIONS}: ${msg}`, time: Date.now() }]);
    setTimeout(() => setWarnings(prev => prev.slice(1)), 5000);
    if (count >= MAX_VIOLATIONS) endInterview(true);
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
    } catch {}
  };

  useEffect(() => {
    const handler = () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
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

  // ═══ CANDIDATE VIDEO CALLBACK ═══
  const candidateVideoCallback = useCallback((node) => {
    candidateVideoRef.current = node;
    if (node && localStreamRef.current) { node.srcObject = localStreamRef.current; node.play().catch(() => {}); }
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
            ctx.strokeRect(box.x, box.y, box.width, box.height); ctx.setLineDash([]);
            [det.landmarks.getLeftEye(), det.landmarks.getRightEye()].forEach(eye => {
              ctx.beginPath();
              eye.forEach((pt, i) => { i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y); });
              ctx.closePath(); ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 1.5; ctx.stroke();
            });
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

  // ═══ START INTERVIEW — Create room + connect ═══
  const startInterview = async () => {
    setPhase('connecting');

    try {
      // 1. Get camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      localStreamRef.current = stream;

      // 2. Create LiveKit room via our backend
      const roomResp = await fetch(`${API_BASE}/api/livekit/create-room`, {
        method: 'POST',
        headers: interviewAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          candidate_email: candidateEmail,
          candidate_name: candidateName,
          interview_config: config || {}
        })
      });
      const roomData = await roomResp.json();

      if (!roomData.token || !roomData.livekit_url) {
        throw new Error('Failed to create LiveKit room. Check backend LiveKit credentials.');
      }

      console.log('🏠 Room created:', roomData.room_name);
      console.log('🔗 LiveKit URL:', roomData.livekit_url);

      // 3. Connect to LiveKit room
      const { Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room();
      roomRef.current = room;

      // Listen for agent joining (Simli avatar track)
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('📹 Track subscribed:', track.kind, 'from', participant.identity);
        if (track.kind === Track.Kind.Video && participant.identity !== candidateName) {
          // This is the avatar's video track
          if (avatarVideoRef.current) {
            track.attach(avatarVideoRef.current);
            setAgentJoined(true);
            console.log('🎭 Avatar video attached!');
          }
        }
        if (track.kind === Track.Kind.Audio && participant.identity !== candidateName) {
          // Avatar's audio — create an audio element
          const audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          track.attach(audioEl);
          console.log('🔊 Avatar audio attached!');
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('👤 Participant joined:', participant.identity);
        if (participant.identity.includes('agent') || participant.identity.includes('simli')) {
          setAgentJoined(true);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('📴 Disconnected from room');
      });

      // Connect
      await room.connect(roomData.livekit_url, roomData.token);
      console.log('✅ Connected to LiveKit room');

      // Publish local camera + mic
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log('📷 Camera + mic published');

      // Enter fullscreen + go live
      await enterFullscreen();
      setPhase('live');
      setTimer(0);

      // Update candidate video with local stream
      if (candidateVideoRef.current && localStreamRef.current) {
        candidateVideoRef.current.srcObject = localStreamRef.current;
        candidateVideoRef.current.play().catch(() => {});
      }

    } catch (e) {
      console.error('Failed to start interview:', e);
      // Inline error UI — no alert() so the user can copy/paste the message
      // and the page stays interactive.
      const msg = e?.message || 'Could not connect to the interview server.';
      let hint = 'Try again in a moment, or contact your hiring manager if the issue persists.';
      if (/livekit/i.test(msg)) {
        hint = 'LiveKit room could not be created. The server is missing LiveKit credentials — contact your hiring manager.';
      } else if (/mic|microphone|permission/i.test(msg)) {
        hint = 'Please allow microphone access in your browser settings and reload.';
      } else if (/network|fetch/i.test(msg)) {
        hint = 'Network error reaching the interview server. Check your connection and try again.';
      }
      setSetupError({ message: msg, hint });
      setPhase('setup');
    }
  };

  // ═══ END INTERVIEW ═══
  const endInterview = async (terminated = false) => {
    // Stop everything
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); }
    if (roomRef.current) { try { roomRef.current.disconnect(); } catch {} }
    if (faceDetectionRef.current) clearInterval(faceDetectionRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}

    setPhase('ended');

    // Send proctoring data to backend and get report
    const reportData = {
      report: terminated
        ? '## Interview Terminated\n\nAutomatically terminated after exceeding proctoring violation limit.'
        : '## Interview Completed\n\nThe AI interviewer has concluded the session. Full transcript and scoring available from the agent.',
      scores: [],
      violations: violationCountRef.current,
      eyeContact,
      timer,
      terminated,
      avgScore: 0,
      lookAwayCount,
    };

    // Try to fetch transcript/scores from backend (agent may have saved them)
    try {
      const resp = await fetch(`${API_BASE}/api/chat/get-interview-results/${encodeURIComponent(candidateEmail)}`, {
        headers: interviewAuthHeaders()
      });
      const data = await resp.json();
      if (data.results?.length > 0) {
        const latest = data.results[data.results.length - 1];
        if (latest.report) Object.assign(reportData, latest.report);
      }
    } catch {}

    // Add proctoring data
    reportData.violations = violationCountRef.current;
    reportData.eyeContact = eyeContact;
    reportData.timer = timer;
    reportData.terminated = terminated;
    reportData.lookAwayCount = lookAwayCount;

    if (onComplete) onComplete(reportData);
    else if (onExit) onExit();
  };

  // ═══ TOGGLE MIC ═══
  const toggleMic = () => {
    if (roomRef.current) {
      const newMuted = !muted;
      roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setMuted(newMuted);
    }
  };

  // Cleanup
  useEffect(() => () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (roomRef.current) try { roomRef.current.disconnect(); } catch {}
    if (faceDetectionRef.current) clearInterval(faceDetectionRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ═══ RENDER ═══
  return (
    <div ref={containerRef} style={{ background: '#0A0A0F', color: '#F4F4F5', position: 'fixed', inset: 0, zIndex: 9999, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ═══ SETUP ═══ */}
      {phase === 'setup' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px', background: 'linear-gradient(135deg, #0A0A0F, #111128)' }}>
          <div style={{ maxWidth: '560px', width: '100%', padding: '48px', background: 'rgba(14,14,22,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', textAlign: 'center' }}>
            <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '3px solid rgba(59,130,246,0.3)' }}>
              <Bot size={40} color="#fff" />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>Live AI Interview</h1>
            <p style={{ color: '#71717A', marginBottom: '24px' }}>You'll be speaking with Alex, an AI interviewer with a live avatar.</p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {config?.role && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '13px', color: '#A1A1AA' }}><Briefcase size={14} /> {config.role}</span>}
              {config?.num_questions && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '13px', color: '#A1A1AA' }}><Clock size={14} /> {config.num_questions} Qs</span>}
            </div>

            <div style={{ textAlign: 'left', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '24px' }}>
              <p style={{ fontSize: '13px', color: '#F59E0B', fontWeight: '600', marginBottom: '10px' }}>Strict Proctoring — {MAX_VIOLATIONS} violations = auto-termination</p>
              {['Camera + mic required', 'AI avatar interviews you live', 'Face & eye tracking active', 'Tab switching = violation', 'Fullscreen enforced'].map(rule => (
                <span key={rule} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#71717A', padding: '4px 0' }}><Shield size={12} /> {rule}</span>
              ))}
            </div>

            {setupError && (
              <div
                role="alert"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '14px 16px', marginBottom: '20px',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '12px', textAlign: 'left',
                }}
              >
                <AlertTriangle size={18} style={{ color: '#F87171', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '13px', color: '#FCA5A5', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not start interview</div>
                  <div style={{ color: '#FECACA' }}>{setupError.message}</div>
                  {setupError.hint && (
                    <div style={{ color: '#A1A1AA', marginTop: 6, fontSize: '12px' }}>{setupError.hint}</div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={onExit} style={{ padding: '14px 24px', background: 'none', color: '#71717A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => { setSetupError(null); startInterview(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Phone size={18} /> {setupError ? 'Try again' : 'Join Interview'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CONNECTING ═══ */}
      {phase === 'connecting' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <Loader size={48} className="spin" style={{ color: '#3B82F6', marginBottom: '20px' }} />
          <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>Connecting to Interview Room...</h2>
          <p style={{ color: '#71717A' }}>Setting up camera, mic, and AI avatar</p>
        </div>
      )}

      {/* ═══ LIVE ═══ */}
      {phase === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ background: '#EF4444', color: '#fff', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>● LIVE</span>
              <span style={{ background: 'rgba(255,255,255,0.1)', padding: '5px 12px', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace' }}>{formatTime(timer)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', background: faceDetected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: faceDetected ? '#22C55E' : '#EF4444' }}>
                {faceDetected ? <Eye size={12} /> : <EyeOff size={12} />} {faceDetected ? `${eyeContact}%` : 'No face'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', background: violations > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: violations > 0 ? '#F87171' : '#71717A' }}>
                <Shield size={11} /> {violations}/{MAX_VIOLATIONS}
              </span>
              {!agentJoined && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', color: '#F59E0B', background: 'rgba(245,158,11,0.1)' }}>
                  <Loader size={11} className="spin" /> AI joining...
                </span>
              )}
            </div>
          </div>

          {/* Video area */}
          <div style={{ flex: 1, display: 'flex', gap: '2px', background: '#000', position: 'relative' }}>
            {/* Candidate (left) */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <video ref={candidateVideoCallback} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              <canvas ref={candidateCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                {candidateName || 'You'}
              </div>
            </div>

            {/* Avatar (right) */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#111' }}>
              <video ref={avatarVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

              {/* Waiting for agent */}
              {!agentJoined && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0F172A, #1E293B)' }}>
                  <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <Bot size={44} color="#fff" />
                  </div>
                  <p style={{ fontSize: '14px', color: '#94A3B8' }}>Waiting for AI interviewer...</p>
                  <Loader size={16} className="spin" style={{ color: '#3B82F6', marginTop: '8px' }} />
                </div>
              )}

              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Bot size={12} /> Alex (AI Interviewer)
                {agentJoined && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E' }} />}
              </div>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(239,68,68,0.9)', color: '#fff', borderRadius: '10px', fontSize: '13px', fontWeight: '600' }}>
                    <AlertTriangle size={14} /> {w.msg}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '16px 24px', background: '#111118', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={toggleMic} style={{ width: '52px', height: '52px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: muted ? '#EF4444' : 'rgba(255,255,255,0.1)', color: '#fff' }}>
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button onClick={() => endInterview(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '30px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              <PhoneOff size={18} /> End Interview
            </button>
          </div>
        </div>
      )}

      {/* ═══ ENDED ═══ */}
      {phase === 'ended' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <Loader size={40} className="spin" style={{ color: '#3B82F6', marginBottom: '16px' }} />
          <h2>Generating Report...</h2>
          <p style={{ color: '#71717A', marginTop: '8px' }}>Returning to dashboard...</p>
        </div>
      )}
    </div>
  );
}
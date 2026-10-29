/**
 * InterviewRoom v4 — LiveKit + Simli Avatar Interview
 *
 * The AI interviewer (Simli avatar) joins as a real participant in a LiveKit room.
 * Candidate's camera shows on the left, avatar video on the right.
 * Face tracking + proctoring runs on the frontend.
 * When it ends, the backend writes a report from the transcript.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Mic, MicOff, AlertTriangle, Eye, EyeOff,
  Clock, Loader, Shield, Briefcase,
  Phone, PhoneOff
} from 'lucide-react';
import { API_BASE, interviewAuthHeaders } from '../services/authFetch';
import InterviewConsent from './shared/InterviewConsent';
import '../styles/studio-interview.css';

const FACE_API_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
const MAX_VIOLATIONS = 3;

export default function InterviewRoom({ config, candidateName, candidateEmail, onComplete, onExit }) {
  const [phase, setPhase] = useState('setup'); // setup | connecting | live | ended
  const [consented, setConsented] = useState(false);
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
  // What endInterview reports, as of now. It is also called from addViolation,
  // a callback made once, so reading state there gave the values from the
  // first render: an interview ended for violations reported 0 time and 0%
  // face in view.
  const latestRef = useRef({ eyeContact: 0, timer: 0, lookAwayCount: 0, onComplete, onExit });
  useEffect(() => {
    latestRef.current = { eyeContact, timer, lookAwayCount, onComplete, onExit };
  });

  const formatTime =(s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

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
    } catch { /* refused or unsupported: the interview carries on in the window */ }
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
      } catch { /* a frame that couldn't be read: the next check is 600 ms away */ }
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
          interview_config: config || {},
          consent: true,
        })
      });
      const roomData = await roomResp.json().catch(() => ({}));
      // The server's reason, such as a finished interview: every refusal
      // read as missing LiveKit credentials.
      if (!roomResp.ok) {
        throw new Error(typeof roomData.detail === 'string' ? roomData.detail : `The interview room could not be created (${roomResp.status}).`);
      }

      if (!roomData.token || !roomData.livekit_url) {
        throw new Error('Failed to create LiveKit room. Check backend LiveKit credentials.');
      }

      // 3. Connect to LiveKit room
      const { Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room();
      roomRef.current = room;

      // Listen for agent joining (Simli avatar track)
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video && participant.identity !== candidateName) {
          // This is the avatar's video track
          if (avatarVideoRef.current) {
            track.attach(avatarVideoRef.current);
            setAgentJoined(true);
          }
        }
        if (track.kind === Track.Kind.Audio && participant.identity !== candidateName) {
          // Avatar's audio — create an audio element
          const audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          track.attach(audioEl);
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (participant.identity.includes('agent') || participant.identity.includes('simli')) {
          setAgentJoined(true);
        }
      });

      // Connect
      await room.connect(roomData.livekit_url, roomData.token);

      // Publish local camera + mic
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);

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
    if (roomRef.current) { try { roomRef.current.disconnect(); } catch { /* already disconnected */ } }
    if (faceDetectionRef.current) clearInterval(faceDetectionRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* already left fullscreen */ }

    setPhase('ended');

    // Only what this room measured. The report itself is written by the server
    // once the interviewer has finished, and the dashboard fetches it. This
    // used to make one up ("Full transcript and scoring available", score 0),
    // then ask the manager-only results endpoint, which refuses a candidate's
    // token, so the made-up one was what the candidate saw.
    const latest = latestRef.current;
    const proctoring = {
      violations: violationCountRef.current,
      // No face reading taken (the detector didn't load) is not 0%.
      eyeContact: eyeContactSamples.current.length ? latest.eyeContact : null,
      timer: latest.timer,
      terminated,
      lookAwayCount: latest.lookAwayCount,
    };

    if (latest.onComplete) latest.onComplete(proctoring);
    else if (latest.onExit) latest.onExit();
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
    if (roomRef.current) try { roomRef.current.disconnect(); } catch { /* already disconnected */ }
    if (faceDetectionRef.current) clearInterval(faceDetectionRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return (
    <div ref={containerRef} className="studio-interview studio-avatar-room" data-phase={phase}>
      {phase === 'setup' && <>
        <header className="si-room-header"><div className="si-room-brand"><span className="si-brand-mark">r.</span><div><span className="si-eyebrow">ResuMate · Video interview</span><strong>{candidateName ? `Hi ${candidateName}` : 'Your interview'}</strong></div></div><span className="si-status-tag">A space to be heard</span></header>
        <main className="si-setup-shell">
          <div className="si-setup-intro"><span className="si-eyebrow">Meet your next opportunity</span><h1>More than a résumé.<br /><em>A real conversation.</em></h1><p>Meet Alex, your AI interviewer. Bring your experience, your curiosity, and a little room to think.</p><div className="si-setup-details"><span><Eye size={15} /> Camera on</span><span><Mic size={15} /> Microphone ready</span></div><div className="si-proctoring"><strong><Shield size={15} /> Strict Proctoring — {MAX_VIOLATIONS} violations = auto-termination</strong>{['Camera + mic required', 'AI avatar interviews you live', 'Face & eye tracking active', 'Tab switching = violation', 'Fullscreen enforced'].map(rule => <span key={rule}><Shield size={12} /> {rule}</span>)}</div></div>
          <div className="si-setup-card">
            <div className="si-setup-icon"><Bot size={30} /></div><span className="si-eyebrow">Before we begin</span><h2>Live AI Interview</h2><p className="si-lead">You'll be speaking with Alex, an AI interviewer with a live avatar.</p>
            <div className="si-interview-details">{config?.role && <span><Briefcase size={14} /> {config.role}</span>}{config?.num_questions && <span><Clock size={14} /> {config.num_questions} Qs</span>}</div>
            <InterviewConsent video checked={consented} onChange={setConsented} />
            {setupError && <div role="alert" className="si-error"><AlertTriangle size={18} /><div><strong>Could not start interview</strong><p>{setupError.message}</p>{setupError.hint && <p>{setupError.hint}</p>}</div></div>}
            <div className="si-setup-actions"><button onClick={onExit} className="si-button si-button-secondary">Cancel</button><button onClick={() => { setSetupError(null); startInterview(); }} disabled={!consented} className="si-button si-button-primary"><Phone size={17} /> {setupError ? 'Try again' : 'Join Interview'}</button></div>
          </div>
        </main>
      </>}

      {phase === 'connecting' && <div className="si-state" role="status"><div className="si-state-icon"><Loader size={32} className="spin" /></div><span className="si-eyebrow">Getting ready</span><h2>Connecting to Interview Room...</h2><p>Setting up camera, mic, and AI avatar</p></div>}

      {phase === 'live' && <div className="si-video-live">
        <header className="si-video-topbar"><div className="si-video-session"><span className="si-live-badge">● LIVE</span><span className="si-timer">{formatTime(timer)}</span><span className="si-session-title">Your conversation with Alex</span></div><div className="si-video-status"><span className={`si-tracking ${faceDetected ? 'is-present' : 'has-warning'}`}>{faceDetected ? <Eye size={13} /> : <EyeOff size={13} />}{faceDetected ? `In view ${eyeContact}%` : 'No face'}</span><span className={`si-tracking ${violations > 0 ? 'has-warning' : ''}`}><Shield size={12} />{violations}/{MAX_VIOLATIONS}</span>{!agentJoined && <span className="si-tracking"><Loader size={12} className="spin" /> AI joining...</span>}</div></header>
        <div className="si-video-stage">
          <div className="si-video-tile"><video ref={candidateVideoCallback} autoPlay muted playsInline className="si-candidate-video" /><canvas ref={candidateCanvasRef} className="si-face-overlay" /><div className="si-video-label">{candidateName || 'You'}</div></div>
          <div className="si-video-tile"><video ref={avatarVideoRef} autoPlay playsInline />{!agentJoined && <div className="si-avatar-waiting"><div><Bot size={42} /></div><p>Waiting for AI interviewer...</p><Loader size={16} className="spin" /></div>}<div className="si-video-label"><Bot size={13} /> Alex (AI Interviewer){agentJoined && <span className="si-participant-online" />}</div></div>
          {warnings.length > 0 && <div className="si-video-warnings" role="alert">{warnings.map((w, i) => <div key={i}><AlertTriangle size={15} /> {w.msg}</div>)}</div>}
        </div>
        <div className="si-video-controls"><span className="si-video-footer-note"><Shield size={14} /> Interview in progress</span><div className="si-control-buttons"><button onClick={toggleMic} aria-label="Mute microphone" aria-pressed={muted} className={`si-mic-control ${muted ? 'is-muted' : ''}`}>{muted ? <MicOff size={21} /> : <Mic size={21} />}</button><button onClick={() => endInterview(false)} className="si-button si-button-end"><PhoneOff size={17} /> End Interview</button></div><span className="si-video-footer-note">ResuMate interview studio</span></div>
      </div>}

      {phase === 'ended' && <div className="si-state" role="status"><div className="si-state-icon"><Loader size={30} className="spin" /></div><span className="si-eyebrow">Conversation complete</span><h2>Generating Report...</h2><p>Returning to dashboard...</p></div>}
    </div>
  );
}

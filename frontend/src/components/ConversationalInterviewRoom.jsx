/**
 * ConversationalInterviewRoom â€” audio-only OpenAI Realtime interview.
 *
 * No LiveKit. No camera. No avatar. The candidate's browser opens a direct
 * WebRTC peer connection to OpenAI's realtime endpoint using the ephemeral
 * client secret minted by /api/realtime/session. Audio is bidirectional;
 * transcripts arrive over the data channel and are checkpointed to the
 * backend every few user turns. On disconnect or "End interview" we finalize
 * â€” the backend runs an LLM pass over the transcript and stores a markdown
 * report on the interview row.
 *
 * Adapted in spirit from innovate-Us/innovateus-feedback
 * (apps/web/src/components/ConversationalInterview.tsx). Stripped: topic
 * advancement, Echo/Pulse/Mentor agents, cohort/submission concepts, i18n.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, Loader, AlertCircle } from 'lucide-react';

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com')
  : '';
const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime';

// How many user turns before we POST a checkpoint. Low number so a disconnect
// mid-interview still leaves a useful transcript on the server.
const CHECKPOINT_EVERY_N_USER_TURNS = 3;

export default function ConversationalInterviewRoom({
  interviewId,
  candidateEmail,
  candidateName,
  onComplete,
  onExit,
}) {
  const [phase, setPhase] = useState('setup'); // setup | connecting | live | ended
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);
  const [turns, setTurns] = useState([]); // [{role, text, ts}]
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [timer, setTimer] = useState(0);
  const [remainingMinutes, setRemainingMinutes] = useState(null);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(0);
  const timerRef = useRef(null);
  const userTurnCountRef = useRef(0);
  const turnsRef = useRef([]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);

  const authHeader = () => {
    const token =
      localStorage.getItem('resumate_candidate_token') ||
      localStorage.getItem('resumate_hm_token') ||
      'demo-token';
    return `Bearer ${token}`;
  };

  const fmtTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = 0; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (dcRef.current) { try { dcRef.current.close(); } catch (_) {} dcRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch (_) {} pcRef.current = null; }
    analyserRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ─── Checkpoint ───────────────────────────────────────────────────────────
  const sendCheckpoint = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/realtime/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify({ interview_id: interviewId, transcript: turnsRef.current }),
      });
    } catch (e) {
      // Best-effort; don't surface to the candidate. Final state captured on finalize.
      console.warn('checkpoint failed:', e?.message);
    }
  }, [interviewId]);

  // ─── Finalize ─────────────────────────────────────────────────────────────
  const finalize = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/realtime/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify({
          interview_id: interviewId,
          transcript: turnsRef.current,
          duration: timerRef.current ? Math.floor(timer) : 0,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        onComplete?.({ transcript: turnsRef.current, ...data });
      }
    } catch (e) {
      console.warn('finalize failed:', e?.message);
    }
  }, [interviewId, onComplete, timer]);

  // ─── Append a turn (dedupe consecutive empty / duplicate text) ────────────
  const appendTurn = useCallback((role, text) => {
    if (!text || !text.trim()) return;
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && last.text === text) return prev;
      return [...prev, { role, text, ts: Date.now() }];
    });
    if (role === 'candidate') {
      userTurnCountRef.current += 1;
      if (userTurnCountRef.current % CHECKPOINT_EVERY_N_USER_TURNS === 0) {
        // Fire-and-forget; uses turnsRef which is one render behind, fine for checkpoint.
        setTimeout(sendCheckpoint, 0);
      }
    }
  }, [sendCheckpoint]);

  // ─── Mic VAD (visual only) ────────────────────────────────────────────────
  const startAudioMeter = useCallback((stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
        setAudioLevel(Math.min(1, Math.sqrt(sumSq / buf.length) * 4));
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn('audio meter unavailable:', e?.message);
    }
  }, []);

  // ─── Start: mint session, open WebRTC, attach handlers ────────────────────
  const start = useCallback(async () => {
    setPhase('connecting');
    setError(null);
    setTurns([]);
    userTurnCountRef.current = 0;

    try {
      // 1) Mint OpenAI ephemeral client secret via our backend.
      const tokenResp = await fetch(`${API_BASE}/api/realtime/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify({
          interview_id: interviewId,
          candidate_email: candidateEmail,
        }),
      });
      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        throw new Error(`Session mint failed (${tokenResp.status}): ${errText.slice(0, 200)}`);
      }
      const sessionData = await tokenResp.json();
      const clientSecret = sessionData.client_secret;
      const model = sessionData.model || 'gpt-realtime-2';
      setRemainingMinutes(sessionData.remaining_minutes ?? null);

      // 2) Open the candidate's mic.
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      micStreamRef.current = micStream;
      startAudioMeter(micStream);

      // 3) Build the peer connection. The remote audio track plays Alex's voice.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      micStream.getTracks().forEach((track) => pc.addTrack(track, micStream));

      // 4) Data channel for transcript + control events.
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Track AI-speaking state for the UI.
          if (msg.type === 'output_audio_buffer.started' || msg.type === 'response.output_audio.delta') {
            setAiSpeaking(true);
          } else if (
            msg.type === 'output_audio_buffer.stopped' ||
            msg.type === 'response.done'
          ) {
            setAiSpeaking(false);
          }
          // Candidate transcript: gpt-4o-transcribe emits user_input_transcribed.
          if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            const text = msg.transcript || '';
            if (text.trim()) appendTurn('candidate', text.trim());
          }
          // AI transcript: response.audio_transcript.done delivers the assistant turn.
          if (msg.type === 'response.audio_transcript.done') {
            const text = msg.transcript || '';
            if (text.trim()) appendTurn('interviewer', text.trim());
          }
        } catch (_) {
          // Non-JSON or unknown event â€” ignore.
        }
      };

      // 5) SDP offer/answer with OpenAI. The model and Authorization headers
      //    are the contract documented by OpenAI Realtime API.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResp = await fetch(`${OPENAI_REALTIME_URL}?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!sdpResp.ok) {
        const errText = await sdpResp.text();
        throw new Error(`OpenAI SDP exchange failed (${sdpResp.status}): ${errText.slice(0, 200)}`);
      }
      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // 6) Live timer + go.
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        setTimer(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);

      setPhase('live');
    } catch (e) {
      console.error('Failed to start conversational interview:', e);
      let hint = 'Try again in a moment, or contact your hiring manager if it persists.';
      const msg = e?.message || 'Could not connect to the interview.';
      if (/permission|denied|microphone/i.test(msg)) {
        hint = 'Allow microphone access in your browser settings and reload.';
      } else if (/session mint/i.test(msg)) {
        hint = 'The interview session could not be created on the server. Your link may be expired â€” contact your hiring manager.';
      } else if (/sdp|webrtc|realtime/i.test(msg)) {
        hint = "Couldn't reach OpenAI Realtime. Check your connection and try again.";
      }
      setError({ message: msg, hint });
      setPhase('setup');
      cleanup();
    }
  }, [interviewId, candidateEmail, startAudioMeter, appendTurn, cleanup]);

  // ─── Toggle mute ──────────────────────────────────────────────────────────
  const toggleMute = () => {
    if (!micStreamRef.current) return;
    micStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = muted; });
    setMuted((m) => !m);
  };

  // ─── End interview ────────────────────────────────────────────────────────
  const endInterview = async () => {
    setPhase('ended');
    cleanup();
    await finalize();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, #0B0B12 0%, #14141F 100%)',
      color: '#E4E4E7', display: 'flex', flexDirection: 'column', padding: '24px',
    }}>
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: '#A1A1AA' }}>Voice interview</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {candidateName ? `Hi ${candidateName}` : 'Voice interview'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {phase === 'live' && (
            <span style={{ fontSize: 13, color: '#A1A1AA' }}>{fmtTime(timer)}</span>
          )}
          {remainingMinutes != null && phase === 'live' && (
            <span style={{ fontSize: 12, color: '#71717A' }}>up to {remainingMinutes} min</span>
          )}
        </div>
      </div>

      {/* Setup screen */}
      {phase === 'setup' && (
        <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%', margin: '0 auto 20px',
            background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(34,197,94,0.4)',
          }}>
            <Mic size={36} color="#22C55E" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Ready when you are</h2>
          <p style={{ color: '#A1A1AA', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
            You'll have a short voice conversation with Alex, an AI interviewer.
            Speak naturally â€” you can interrupt and ask Alex to repeat anything.
            Make sure you're in a quiet space.
          </p>
          {error && (
            <div style={{
              marginBottom: 20, padding: '12px 16px', borderRadius: 8,
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
              display: 'flex', gap: 10, textAlign: 'left',
            }}>
              <AlertCircle size={18} color="#F87171" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#FCA5A5' }}>{error.message}</div>
                <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 4 }}>{error.hint}</div>
              </div>
            </div>
          )}
          <button
            onClick={start}
            className="btn btn-primary"
            style={{
              padding: '14px 32px', borderRadius: 8, fontSize: 15, fontWeight: 600,
              background: '#22C55E', color: '#0B0B12', border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <Mic size={18} /> Start interview
          </button>
          <button
            onClick={() => onExit?.()}
            style={{
              display: 'block', margin: '16px auto 0', background: 'transparent',
              border: 'none', color: '#71717A', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Connecting state */}
      {phase === 'connecting' && (
        <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
          <Loader size={32} className="spin" style={{ marginBottom: 16 }} />
          <p style={{ color: '#A1A1AA' }}>Connecting to the interviewer…</p>
        </div>
      )}

      {/* Live conversation */}
      {phase === 'live' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: 24, maxWidth: 720, margin: '0 auto', width: '100%' }}>
          {/* Big mic / speaking indicator */}
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 140, height: 140, borderRadius: '50%', margin: '0 auto 12px',
              background: aiSpeaking
                ? 'radial-gradient(circle, rgba(34,197,94,0.4) 0%, rgba(34,197,94,0.1) 70%, transparent 100%)'
                : 'radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(59,130,246,0.05) 70%, transparent 100%)',
              border: `2px solid ${aiSpeaking ? '#22C55E' : 'rgba(59,130,246,0.5)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: `scale(${1 + (aiSpeaking ? 0.05 : audioLevel * 0.15)})`,
              transition: 'transform 80ms, border-color 200ms, background 200ms',
            }}>
              <Mic size={48} color={aiSpeaking ? '#22C55E' : '#3B82F6'} />
            </div>
            <div style={{ fontSize: 13, color: '#A1A1AA' }}>
              {aiSpeaking ? 'Alex is speaking…' : (muted ? 'You are muted' : 'Listening…')}
            </div>
          </div>

          {/* Transcript scroll */}
          <div style={{
            flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20,
            border: '1px solid rgba(255,255,255,0.08)', maxHeight: 360, overflowY: 'auto',
          }}>
            {turns.length === 0 ? (
              <div style={{ color: '#71717A', fontSize: 13, fontStyle: 'italic' }}>
                Conversation will appear here as you talk…
              </div>
            ) : (
              turns.map((t, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    color: t.role === 'interviewer' ? '#22C55E' : '#3B82F6',
                    marginBottom: 4,
                  }}>
                    {t.role === 'interviewer' ? 'Alex' : 'You'}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: '#E4E4E7' }}>{t.text}</div>
                </div>
              ))
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 24 }}>
            <button
              onClick={toggleMute}
              style={{
                padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
                background: muted ? '#EF4444' : 'rgba(255,255,255,0.08)',
                color: muted ? '#fff' : '#E4E4E7',
                border: `1px solid ${muted ? '#EF4444' : 'rgba(255,255,255,0.15)'}`,
                display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14,
              }}
            >
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={endInterview}
              style={{
                padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
                background: '#EF4444', color: '#fff', border: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600,
              }}
            >
              <PhoneOff size={16} /> End interview
            </button>
          </div>
        </div>
      )}

      {/* Ended */}
      {phase === 'ended' && (
        <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Thanks for talking with us</h2>
          <p style={{ color: '#A1A1AA', fontSize: 14, marginBottom: 24 }}>
            Your interview has been recorded. The hiring team will follow up shortly.
          </p>
          <button
            onClick={() => onExit?.()}
            style={{
              padding: '12px 24px', borderRadius: 8, cursor: 'pointer',
              background: '#3B82F6', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ConversationalInterviewRoom — audio-only OpenAI Realtime interview.
 *
 * No LiveKit. No camera. No avatar. The candidate's browser opens a direct
 * WebRTC peer connection to OpenAI's realtime endpoint using the ephemeral
 * client secret minted by /api/realtime/session. Audio is bidirectional;
 * transcripts arrive over the data channel and are checkpointed to the
 * backend every few user turns. On disconnect or "End interview" we finalize
 * — the backend runs an LLM pass over the transcript and stores a markdown
 * report on the interview row.
 *
 * Adapted in spirit from innovate-Us/innovateus-feedback
 * (apps/web/src/components/ConversationalInterview.tsx). Stripped: topic
 * advancement, Echo/Pulse/Mentor agents, cohort/submission concepts, i18n.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, Loader, AlertCircle } from 'lucide-react';
import { API_BASE, interviewAuthHeaders, responseError } from '../services/authFetch';
import { deviceStep, reaching, shownFailure, startFailed } from './shared/startFailure';
import InterviewConsent from './shared/InterviewConsent';
import ConversationSculpture from './studio/ConversationSculpture';

// Where the browser's offer goes, with the session's key; the model and voice
// were set when the server got the key. The beta's address, /v1/realtime?model=,
// refuses an offer since OpenAI retired its beta, so no interview could start.
const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

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
  const [consented, setConsented] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);
  const [turns, setTurns] = useState([]); // [{role, text, ts}]
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [timer, setTimer] = useState(0);
  const [remainingMinutes, setRemainingMinutes] = useState(null);
  // "connected" | "checking" | "lost" — drives a small reconnect-style banner
  // when the candidate's network blips so they don't keep talking to nothing.
  const [connState, setConnState] = useState('connected');

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(0);
  const timerRef = useRef(null);
  const userTurnCountRef = useRef(0);
  const turnsRef = useRef([]);
  const phaseRef = useRef('setup');
  const interviewIdRef = useRef(interviewId);
  const finalizedRef = useRef(false); // guard against double-finalize on unload + manual end
  const transcriptScrollRef = useRef(null);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { interviewIdRef.current = interviewId; }, [interviewId]);

  // Keep the transcript pinned to the newest turn. Without this the candidate
  // has to scroll every time a new line arrives.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    // Defer one frame so the DOM has the new line laid out before we measure.
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [turns.length]);

  const fmtTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = 0; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (dcRef.current) { try { dcRef.current.close(); } catch { /* already closed */ } dcRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch { /* already closed */ } pcRef.current = null; }
    analyserRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ─── Checkpoint ───────────────────────────────────────────────────────────
  const sendCheckpoint = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/realtime/checkpoint`, {
        method: 'POST',
        headers: interviewAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ interview_id: interviewId, transcript: turnsRef.current }),
      });
    } catch (e) {
      // Best-effort; don't surface to the candidate. Final state captured on finalize.
      console.warn('checkpoint failed:', e?.message);
    }
  }, [interviewId]);

  // ─── Finalize ─────────────────────────────────────────────────────────────
  const finalize = useCallback(async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    try {
      const resp = await fetch(`${API_BASE}/api/realtime/finalize`, {
        method: 'POST',
        headers: interviewAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          interview_id: interviewId,
          transcript: turnsRef.current,
          // The elapsed seconds themselves. This sent 0 unless the timer was
          // still running, and endInterview stops it (cleanup) before
          // finalising, so every interview ended with the button was 0:00.
          duration: Math.floor(timer),
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

  // Auto-finalize when the tab is closed mid-interview. Uses `keepalive: true`
  // so the request survives unload — sendBeacon would too, but it can't carry
  // the Authorization header. Without this the transcript is lost when the
  // candidate closes the tab.
  //
  // We also trigger the browser's native "Leave site?" prompt during a live
  // interview so an accidental Cmd/Ctrl+R doesn't silently destroy the session.
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (phaseRef.current === 'live' && !finalizedRef.current) {
        // Show the confirmation dialog. Modern browsers ignore the message
        // string but require both preventDefault and a returnValue assignment.
        event.preventDefault();
        event.returnValue = '';
      }
      if (finalizedRef.current) return;
      if (phaseRef.current !== 'live') return;
      const ivId = interviewIdRef.current;
      if (!ivId || turnsRef.current.length === 0) return;
      finalizedRef.current = true;
      try {
        fetch(`${API_BASE}/api/realtime/finalize`, {
          method: 'POST',
          headers: interviewAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            interview_id: ivId,
            transcript: turnsRef.current,
            duration: 0,
          }),
          keepalive: true,
        });
      } catch (_) {
        // Best-effort — nothing else to do, the tab is closing.
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onBeforeUnload);
    };
  }, []);

  // ─── Append a turn (dedupe only very-recent identical echoes) ─────────────
  // OpenAI sometimes emits the same transcription twice when an audio buffer
  // is committed and then a follow-up "completed" event fires. We dedupe only
  // when role+text+within-2s match the previous turn — legitimate short
  // answers like "yes" / "no" said a minute apart still both land.
  const appendTurn = useCallback((role, text) => {
    if (!text || !text.trim()) return;
    const cleaned = text.trim();
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (
        last
        && last.role === role
        && last.text === cleaned
        && Date.now() - last.ts < 2000
      ) {
        return prev;
      }
      return [...prev, { role, text: cleaned, ts: Date.now() }];
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
    setConnState('checking');
    userTurnCountRef.current = 0;

    try {
      // 1) Mic FIRST. If the candidate denies, we bail before burning an OpenAI
      //    realtime session that would otherwise count against the per-IP rate
      //    limit and the per-account budget. The same call also serves as the
      //    user-gesture that satisfies autoplay policies for the remote audio.
      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (err) {
        // Which it was: "could not connect" hid the real cause, most often a
        // blocked microphone.
        throw startFailed(deviceStep(err, 'micBlocked', 'micUnavailable'));
      }
      micStreamRef.current = micStream;
      startAudioMeter(micStream);

      // 2) Mint OpenAI ephemeral client secret via our backend.
      const tokenResp = await reaching('unreachable', () => fetch(`${API_BASE}/api/realtime/session`, {
        method: 'POST',
        headers: interviewAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          interview_id: interviewId,
          candidate_email: candidateEmail,
          consent: true,
        }),
      }));
      if (!tokenResp.ok) {
        throw startFailed('refused', await responseError(tokenResp, 'The interview couldn’t be started.'));
      }
      const sessionData = await tokenResp.json();
      const clientSecret = sessionData.client_secret;
      setRemainingMinutes(sessionData.remaining_minutes ?? null);

      // 3) Build the peer connection. The remote audio track plays Alex's voice.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // Surface connection drops to the UI. Without this a dead session looks
      // identical to a quiet one — the candidate keeps talking and never sees
      // Alex respond. Maps RTC's many states to three buckets the banner uses.
      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') setConnState('connected');
        else if (s === 'checking' || s === 'new') setConnState('checking');
        else if (s === 'disconnected') setConnState('lost');
        else if (s === 'failed' || s === 'closed') setConnState('lost');
      };

      micStream.getTracks().forEach((track) => pc.addTrack(track, micStream));

      // 4) Data channel for transcript + control events.
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      // Alex speaks first. The model answers only when asked, and nothing
      // asked: the candidate heard silence until they spoke. Its instructions'
      // opening turn greets the candidate and asks the first question.
      dc.onopen = () => {
        try {
          dc.send(JSON.stringify({ type: 'response.create' }));
        } catch (e) {
          console.warn('could not start the interviewer:', e?.message);
        }
      };
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
          // The interviewer's line, once said. OpenAI's current API calls it
          // response.output_audio_transcript.done; listening only for the
          // beta's response.audio_transcript.done kept none of the
          // interviewer's questions in the transcript or the report.
          if (msg.type === 'response.output_audio_transcript.done' || msg.type === 'response.audio_transcript.done') {
            const text = msg.transcript || '';
            if (text.trim()) appendTurn('interviewer', text.trim());
          }
          // What OpenAI refused, for whoever looks into a silent interviewer:
          // its code and words, which name a setting, never what was said.
          if (msg.type === 'error') {
            console.warn('interviewer error:', msg.error?.code || msg.error?.type, msg.error?.message);
          }
        } catch (_) {
          // Non-JSON or unknown event — ignore.
        }
      };

      // 5) SDP offer/answer with OpenAI, as its Realtime API documents for a
      //    browser holding a session key.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResp = await reaching('connect', () => fetch(OPENAI_REALTIME_CALLS_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
      }));
      if (!sdpResp.ok) throw startFailed('connect');
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
      setError(shownFailure(e));
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
  // A page of its own over the rest of the app (studio-interview.css).
  return (
    <div className="studio-interview studio-voice-room" data-phase={phase}>
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

      <header className="si-room-header">
        <div className="si-room-brand">
          <span className="si-brand-mark" aria-hidden="true">r.</span>
          <div>
            <span className="si-eyebrow">ResuMate · Voice interview</span>
            <strong>{candidateName ? `Hi ${candidateName}` : 'Your interview'}</strong>
          </div>
        </div>
        <div className="si-room-timing">
          {phase === 'live' && <span className="si-timer">{fmtTime(timer)}</span>}
          {remainingMinutes != null && phase === 'live' && <span>up to {remainingMinutes} min</span>}
          {phase === 'setup' && <span className="si-status-tag">A space to be heard</span>}
        </div>
      </header>

      {phase === 'setup' && (
        <main className="si-setup-shell">
          <div className="si-setup-intro">
            <span className="si-eyebrow">The next conversation</span>
            <h1>Your experience.<br /><em>In your own words.</em></h1>
            <p>Take a breath. Find a quiet space. This is your time to share how you think and what you bring.</p>
            <ConversationSculpture variant="welcome" />
            <div className="si-setup-details">
              <span><Mic size={15} aria-hidden="true" /> Audio only</span>
              <span>Speak naturally</span>
              <span>Take your time</span>
            </div>
          </div>
          <div className="si-setup-card">
            <div className="si-setup-icon" aria-hidden="true"><Mic size={28} /></div>
            <span className="si-eyebrow">Before we begin</span>
            <h2>Ready when you are</h2>
            <p className="si-lead">
              You'll have a short voice conversation with Alex, an AI interviewer.
              Speak naturally — you can interrupt and ask Alex to repeat anything.
              Make sure you're in a quiet space.
            </p>
            {error && (
              <div className="si-error" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <div><strong>{error.message}</strong><p>{error.hint}</p></div>
              </div>
            )}
            <InterviewConsent checked={consented} onChange={setConsented} />
            <div className="si-setup-actions">
              <button className="si-button si-button-secondary" onClick={() => onExit?.()}>Cancel</button>
              <button className="si-button si-button-primary" onClick={start} disabled={!consented}>
                <Mic size={17} aria-hidden="true" /> Start interview
              </button>
            </div>
          </div>
        </main>
      )}

      {phase === 'connecting' && (
        <div className="si-state" role="status">
          <div className="si-state-icon" aria-hidden="true"><Loader size={30} className="spin" /></div>
          <h2>Making the connection.</h2>
          <p>Connecting to the interviewer…</p>
        </div>
      )}

      {phase === 'live' && (
        <main className="si-voice-live">
          {/* No reconnecting by itself: the realtime token is single-use and
              short-lived, so a clean restart means ending the interview and
              starting it again. This just tells the candidate to stop talking. */}
          {connState !== 'connected' && (
            <div className={`si-error${connState === 'lost' ? '' : ' si-notice'}`} role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <span>
                {connState === 'lost'
                  ? 'Connection to the interviewer was lost. End the interview and start again from the dashboard.'
                  : 'Reconnecting to the interviewer…'}
              </span>
            </div>
          )}
          <section className="si-listening-panel" aria-label="Conversation status">
            <span className="si-eyebrow">In conversation with Alex</span>
            <ConversationSculpture variant="live" live={connState === 'connected'} level={audioLevel} speaking={aiSpeaking} muted={muted} />
            <h2>{aiSpeaking ? 'Alex is speaking…' : (muted ? 'You are muted' : 'Listening…')}</h2>
            <p>Your words matter. Take the time you need.</p>
          </section>
          <section className="si-transcript-panel" aria-label="Live transcript">
            <header>
              <span className="si-eyebrow">The conversation</span>
              <span className="si-transcript-label">Live transcript</span>
            </header>
            <div className="si-transcript-scroll" ref={transcriptScrollRef}>
              {turns.length === 0 ? (
                <p className="si-transcript-placeholder">Conversation will appear here as you talk…</p>
              ) : turns.map((t, i) => (
                <div key={i} className={`si-transcript-turn ${t.role === 'interviewer' ? 'interviewer' : 'candidate'}`}>
                  <span>{t.role === 'interviewer' ? 'Alex' : 'You'}</span>
                  <p>{t.text}</p>
                </div>
              ))}
            </div>
          </section>
          <div className="si-live-controls">
            <button className={`si-button si-button-secondary${muted ? ' is-muted' : ''}`} onClick={toggleMute}>
              {muted ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button className="si-button si-button-end" onClick={endInterview}>
              <PhoneOff size={17} aria-hidden="true" /> End interview
            </button>
          </div>
        </main>
      )}

      {phase === 'ended' && (
        <div className="si-state">
          <div className="si-state-icon" aria-hidden="true"><Mic size={30} /></div>
          <span className="si-eyebrow">Conversation complete</span>
          <h2>Thanks for talking with us</h2>
          <p>Your interview has been saved. The hiring team will follow up shortly.</p>
          <button className="si-button si-button-primary" onClick={() => onExit?.()}>Done</button>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Mic, MicOff, Loader, ArrowLeft, RotateCcw } from 'lucide-react';
import useVoice from '../../hooks/useVoice';
import ATSResultsView from './ATSResultsView';

const API_BASE = import.meta.env.PROD ? 'https://resumate-api-74dm.onrender.com' : '';
const SESSION_KEY = 'jarvis_session';
const AUTO_LISTEN_DELAY_MS = 900;

// ── Transcription quality filter ──────────────────────────────────────────────
// Common single words that come from speaker echo / background noise
const ECHO_WORDS = new Set([
  'you','the','a','an','and','or','but','in','on','at','to','for','it',
  'is','was','are','be','by','do','go','hi','hey','um','uh','ah','oh',
  'so','like','well','just','right','sure','yeah','yep','nope',
]);

function isUsableTranscription(text) {
  if (!text || !text.trim()) return false;
  const t = text.trim();
  // Must contain at least one letter (filters "****", "123", punctuation-only)
  if (!/[a-zA-Z]/.test(t)) return false;
  // Reject if more than 55% non-ASCII (Hindi, Chinese, etc. from background TV/echo)
  const nonAscii = (t.match(/[^\x00-\x7F]/g) || []).length;
  if (nonAscii / t.length > 0.55) return false;
  // Reject single common filler/echo words
  const words = t.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/);
  if (words.length === 1 && ECHO_WORDS.has(words[0])) return false;
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAtsSummary(data) {
  const { stats = {}, results = [], role = '', total_screened = 0 } = data;
  const top = (results || []).slice(0, 5)
    .map(r => `${r.name} scored ${r.ats_score} (${r.verdict})`).join(', ');
  return (
    `ATS complete for ${role}. Screened ${total_screened} candidates. ` +
    `${stats.strong_fit || 0} Strong Fit, ${stats.good_fit || 0} Good Fit, ` +
    `${stats.consider || 0} Consider, ${stats.no_match || 0} No Match. Top: ${top}.`
  );
}

function buildCandidateList(candidates) {
  if (!candidates.length) return 'No candidates uploaded yet.';
  return candidates
    .map(c => `${c.name} (${c.predicted_role || 'Unknown'}, ${c.total_experience_years || 0}y)`)
    .join('; ');
}

function verdictColor(v = '') {
  const s = v.toLowerCase();
  if (s.includes('strong'))   return '#4ADE80';
  if (s.includes('good'))     return '#38BDF8';
  if (s.includes('consider')) return '#FCD34D';
  return '#F87171';
}

let _id = 0;
const newId = () => ++_id;

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
@keyframes jBreathe {
  0%,100% { box-shadow: 0 0 50px 10px rgba(251,191,36,0.25), 0 0 100px 30px rgba(245,158,11,0.10); transform: scale(1); }
  50%      { box-shadow: 0 0 80px 20px rgba(251,191,36,0.45), 0 0 160px 55px rgba(245,158,11,0.18); transform: scale(1.04); }
}
@keyframes jListen {
  0%,100% { box-shadow: 0 0 50px 12px rgba(251,191,36,0.5), 0 0 0 0 rgba(251,191,36,0); transform: scale(1); }
  50%      { box-shadow: 0 0 70px 18px rgba(251,191,36,0.75), 0 0 0 30px rgba(251,191,36,0); transform: scale(1.02); }
}
@keyframes jSpeak {
  0%   { transform: scale(1.00); box-shadow: 0 0 55px 12px rgba(251,191,36,0.35); }
  20%  { transform: scale(1.06); box-shadow: 0 0 85px 24px rgba(251,191,36,0.65); }
  50%  { transform: scale(1.03); box-shadow: 0 0 65px 16px rgba(251,191,36,0.5); }
  80%  { transform: scale(1.07); box-shadow: 0 0 90px 26px rgba(251,191,36,0.7); }
  100% { transform: scale(1.00); box-shadow: 0 0 55px 12px rgba(251,191,36,0.35); }
}
@keyframes jThink {
  0%,100% { opacity: 0.7; transform: scale(1); }
  50%     { opacity: 1;   transform: scale(1.02); }
}
@keyframes jRipple {
  0%   { transform: scale(1);   opacity: 0.6; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes jWave {
  0%,100% { transform: scaleY(0.3); }
  50%     { transform: scaleY(1); }
}
@keyframes jMsgIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes jDot {
  0%,80%,100% { transform: scale(0); opacity: 0.3; }
  40%          { transform: scale(1); opacity: 1; }
}
@keyframes jSpin {
  to { transform: rotate(360deg); }
}
@keyframes jStatusFade {
  0%,100% { opacity: 0.5; }
  50%     { opacity: 1; }
}
.j-msg { animation: jMsgIn 0.25s cubic-bezier(0.16,1,0.3,1) both; }
`;

// ── Waveform bars ─────────────────────────────────────────────────────────────
function WaveBars({ active }) {
  const delays = [0, 0.1, 0.2, 0.15, 0.05, 0.25, 0.1];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
      {delays.map((d, i) => (
        <div key={i} style={{
          width: 3, height: '100%', borderRadius: 2,
          background: 'rgba(251,191,36,0.85)',
          transformOrigin: 'center',
          animation: active ? `jWave 0.${6 + i}s ease-in-out ${d}s infinite` : 'none',
          transform: active ? undefined : 'scaleY(0.25)',
          opacity: active ? 1 : 0.3,
          transition: 'opacity 0.3s',
        }} />
      ))}
    </div>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 20 }}>
      {[0, 0.18, 0.36].map((d, i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(251,191,36,0.7)',
          animation: `jDot 1.2s ease-in-out ${d}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JarvisAgent({ candidatesSummary = [], onClose, onComplete }) {
  // ── Session restore ────────────────────────────────────────────────────────
  const savedSession = (() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  })();

  const [messages,     setMessages]     = useState(savedSession?.messages     || []);
  const [context,      setContext]      = useState(savedSession?.context      || { role: null, lastAtsResults: null, shortlistedIds: [], lastAction: null, pendingAction: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [orbMode,      setOrbMode]      = useState('idle');
  const [status,       setStatus]       = useState(savedSession?.status       || '');
  const [textInput,    setTextInput]    = useState('');
  const [hint,         setHint]         = useState('');
  // Show full ATS results inline (no navigation away)
  const [resultsData,  setResultsData]  = useState(null);

  const hasGreetedRef  = useRef(!!savedSession);   // skip greeting if restoring
  const msgIndexRef    = useRef(0);
  const messagesEndRef = useRef(null);
  const contextRef     = useRef(context);
  const processingRef  = useRef(false);
  const interruptedRef = useRef(false);
  const voiceRef       = useRef(null);
  const listenAfterRef = useRef(null);   // timeout for auto-listen after TTS
  const autoListenEnabledRef = useRef(false);

  useEffect(() => { contextRef.current   = context;      }, [context]);
  useEffect(() => { processingRef.current = isProcessing; }, [isProcessing]);

  // ── Persist session to storage on every change ────────────────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages, context, status }));
    } catch {}
  }, [messages, context, status]);

  // ── Append message ────────────────────────────────────────────────────────
  const appendMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: newId(), ...msg }]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  // ── Voice callbacks ───────────────────────────────────────────────────────

  // Transcription received — quality-filter, then send
  const handleTranscribed = useCallback((text) => {
    setHint('');
    if (!isUsableTranscription(text)) {
      // Silently discard garbage (background noise, non-Latin script)
      autoListenEnabledRef.current = false;
      console.warn('Jarvis: discarded low-quality transcription:', text);
      return;
    }
    autoListenEnabledRef.current = true;
    handleSendMessageRef.current?.(text); // eslint-disable-line
  }, []);

  // TTS finished — auto-start listening (conversational loop)
  const handleSpeakingDone = useCallback(() => {
    setHint('');
    if (!autoListenEnabledRef.current) return;
    // Clear any pending auto-listen timer
    if (listenAfterRef.current) clearTimeout(listenAfterRef.current);
    // Give speakers/headphones a beat to settle before reopening the mic.
    listenAfterRef.current = setTimeout(() => {
      if (!processingRef.current) {
        voiceRef.current?.startRecording();
        setHint('Listening…');
      }
    }, AUTO_LISTEN_DELAY_MS);
  }, []);

  // Silence auto-stopped recording
  const handleAutoStop = useCallback(() => {
    setHint('Processing…');
  }, []);

  // Transcription failed — stop the loop, wait for user to speak or type again
  const handleTranscribeFail = useCallback((reason) => {
    autoListenEnabledRef.current = false;
    setHint('');
    if (reason === 'mic_denied') {
      setHint('Mic access denied — use the text box below.');
    }
    // too_short / no_speech / error: do NOT auto-restart (prevents infinite loop)
    // User can click the mic button or orb to try again
  }, []);

  const voice = useVoice({
    apiBase: API_BASE,
    onTranscribed:    handleTranscribed,
    onSpeakingDone:   handleSpeakingDone,
    onTranscribeFail: handleTranscribeFail,
    onAutoStop:       handleAutoStop,
  });

  voiceRef.current = voice;   // always current, no stale closure

  // ── Orb mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (voice.isRecording)                    setOrbMode('listening');
    else if (voice.isTranscribing)            setOrbMode('thinking');
    else if (isProcessing)                    setOrbMode('thinking');
    else if (voice.speakingMsgIndex !== null) setOrbMode('speaking');
    else                                      setOrbMode('idle');
  }, [voice.isRecording, voice.isTranscribing, voice.speakingMsgIndex, isProcessing]);

  // ── Core message sender ───────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (text) => {
    if (!text?.trim()) return;
    if (processingRef.current) return;

    // If AI is speaking, stop it and note the interruption
    const v = voiceRef.current;
    if (v?.speakingMsgIndex !== null) {
      interruptedRef.current = true;
      v.stopSpeaking();
    }
    // If recording (manual), stop it
    if (v?.isRecording) v.stopRecording();

    const isSystem = text.startsWith('[');
    if (!isSystem) appendMsg({ role: 'user', content: text });

    setIsProcessing(true);
    setStatus('THINKING');
    setHint('');

    const currentCtx = contextRef.current;
    const wasInterrupted = interruptedRef.current;
    interruptedRef.current = false;

    // Snapshot conversation history synchronously
    const history = [];
    setMessages(prev => {
      prev.forEach(m => {
        if ((m.role === 'user' || m.role === 'assistant') && !m.content?.startsWith('[')) {
          history.push({ role: m.role, content: m.content });
        }
      });
      return prev;
    });

    try {
      const token = localStorage.getItem('resumate_hm_token') || '';
      const res = await fetch(`${API_BASE}/api/jarvis/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          conversation_history: history,
          candidates_summary: candidatesSummary,
          context: {
            role: currentCtx.role,
            last_ats_results: currentCtx.lastAtsResults,
            shortlisted_ids: currentCtx.shortlistedIds,
            last_action: currentCtx.lastAction,
            pending_action: currentCtx.pendingAction,   // tells GPT-4o if confirmation was already asked
            interrupted: wasInterrupted,
          },
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const { reply, action, action_params, awaiting_confirmation, updated_context } = data;

      appendMsg({ role: 'assistant', content: reply });
      voiceRef.current?.speakText(reply, msgIndexRef.current++);

      // Track pending action for confirmation loop prevention
      if (awaiting_confirmation && action) {
        setContext(c => ({ ...c, pendingAction: { action, params: action_params } }));
      } else {
        setContext(c => ({
          ...c,
          pendingAction: null,
          ...(updated_context?.role        ? { role: updated_context.role }              : {}),
          ...(updated_context?.last_action ? { lastAction: updated_context.last_action } : {}),
        }));
      }

      setIsProcessing(false);
      setStatus(
        currentCtx.shortlistedIds.length > 0
          ? `${currentCtx.shortlistedIds.length} SHORTLISTED`
          : candidatesSummary.length > 0
            ? `${candidatesSummary.length} CANDIDATE${candidatesSummary.length !== 1 ? 'S' : ''} READY`
            : 'READY'
      );

      if (action && !awaiting_confirmation) {
        await executeAction(action, action_params || {}); // eslint-disable-line no-use-before-define
      }

    } catch (err) {
      console.error('Jarvis:', err);
      const msg = `Something went wrong — ${err.message}.`;
      appendMsg({ role: 'assistant', content: msg });
      voiceRef.current?.speakText(msg, msgIndexRef.current++);
      setIsProcessing(false);
      setStatus('ERROR');
    }
  }, [candidatesSummary, appendMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable ref so callbacks can call handleSendMessage without circular deps
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; }, [handleSendMessage]);

  // ── Action executor ───────────────────────────────────────────────────────
  // IMPORTANT: batch_action and list_candidates do NOT recurse back into
  // handleSendMessage — that was causing the infinite "want me to send?" loop.
  // They produce a direct Jarvis reply and speak it themselves.
  const executeAction = useCallback(async (action, params) => {
    const token = localStorage.getItem('resumate_hm_token') || '';
    const hdrs  = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    const ctx   = contextRef.current;

    // Helper: speak a direct Jarvis line without going through the API
    const directSay = (text) => {
      appendMsg({ role: 'assistant', content: text });
      voiceRef.current?.speakText(text, msgIndexRef.current++);
    };

    if (action === 'run_ats') {
      // ATS DOES recurse so Jarvis can summarize results conversationally
      setStatus('RUNNING ATS…');
      try {
        const res = await fetch(`${API_BASE}/api/pipeline/run`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            role: params.role || ctx.role || 'Engineer',
            jd_text: params.jd_text || null,
            required_skills: params.required_skills || [],
            min_experience_years: params.min_experience_years || 0,
            auto_shortlist_count: params.auto_shortlist_count || 5,
          }),
        });
        if (!res.ok) throw new Error(`Pipeline ${res.status}`);
        const d = await res.json();
        const shortlisted = (d.shortlist || []).map(r => r.candidate_id);
        setContext(c => ({ ...c, role: params.role || c.role, lastAtsResults: d, shortlistedIds: shortlisted, lastAction: 'run_ats' }));
        appendMsg({ role: 'action', content: `Screened ${d.total_screened} candidates`, actionData: d });
        setStatus(`${shortlisted.length} SHORTLISTED`);
        // Send result summary to Jarvis so it can narrate the top candidates
        await handleSendMessageRef.current(`[ATS_RESULT] ${buildAtsSummary(d)}`);
      } catch (err) {
        appendMsg({ role: 'action', content: `ATS failed: ${err.message}` });
        setStatus('ERROR');
      }

    } else if (action === 'batch_action') {
      // batch_action produces a direct reply — NO recursive API call to avoid
      // the infinite "want me to send?" loop
      setStatus('CREATING INTERVIEWS…');
      try {
        const res = await fetch(`${API_BASE}/api/pipeline/batch-action`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            candidate_ids: params.candidate_ids || ctx.shortlistedIds,
            role: params.role || ctx.role || 'Engineer',
            level: params.level || 'Mid-Level',
            num_questions: params.num_questions || 8,
            email_type: params.email_type || 'interview',
            send_emails: params.send_emails || false,
          }),
        });
        if (!res.ok) throw new Error(`Batch ${res.status}`);
        const d = await res.json();
        const sent = d.emails_sent || 0;
        const created = d.interviews_created || 0;
        const drafted = d.total || 0;

        appendMsg({
          role: 'action',
          content: `Created ${created} interview${created !== 1 ? 's' : ''}` +
            (params.send_emails
              ? ` · Sent ${sent} email${sent !== 1 ? 's' : ''}`
              : ` · ${drafted} email${drafted !== 1 ? 's' : ''} drafted`),
        });
        setContext(c => ({ ...c, lastAction: 'batch_action' }));
        setStatus(params.send_emails && sent > 0 ? 'EMAILS SENT' : 'DONE');

        // Direct spoken reply — no API round-trip, no loop
        if (params.send_emails) {
          if (sent > 0) {
            directSay(`Done! Sent the interview invitation to ${sent} candidate${sent !== 1 ? 's' : ''}. You're all set!`);
          } else {
            directSay(`Interview created, but the email couldn't be sent — you may need to send it manually from your email client.`);
          }
        } else {
          const names = (ctx.shortlistedIds.length > 0)
            ? ` for the shortlisted candidate${ctx.shortlistedIds.length !== 1 ? 's' : ''}`
            : '';
          directSay(`Interview set up${names} and the invitation email is drafted. Want me to send it now?`);
        }
      } catch (err) {
        appendMsg({ role: 'action', content: `Batch failed: ${err.message}` });
        setStatus('ERROR');
        directSay(`Something went wrong creating the interview — ${err.message}.`);
      }

    } else if (action === 'list_candidates') {
      // Direct reply — no API round-trip
      const list = buildCandidateList(candidatesSummary);
      directSay(`Here's who you've uploaded: ${list}`);

    } else if (action === 'show_results') {
      const ctx2 = contextRef.current;
      if (ctx2.lastAtsResults) setResultsData(ctx2.lastAtsResults);
      else directSay("No results yet — tell me the role and I'll screen the candidates.");
    }
  }, [candidatesSummary, appendMsg]);

  // ── Greeting (once) ───────────────────────────────────────────────────────
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const n = candidatesSummary.length;
    const greeting = n > 0
      ? `Hey, I'm Jarvis. I can see ${n} resume${n !== 1 ? 's' : ''} loaded. What role are you hiring for?`
      : "Hey, I'm Jarvis. No resumes uploaded yet — head back, add some, then come talk to me.";

    setStatus(n > 0 ? `${n} CANDIDATE${n !== 1 ? 'S' : ''} READY` : 'NO CANDIDATES');

    setTimeout(() => {
      appendMsg({ role: 'assistant', content: greeting });
      voiceRef.current?.speakText(greeting, msgIndexRef.current++);
    }, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic button — interrupt speaking or toggle recording ───────────────────
  const handleMicClick = useCallback(() => {
    const v = voiceRef.current;
    if (!v) return;

    // Interrupt AI speech
    if (v.speakingMsgIndex !== null) {
      interruptedRef.current = true;
      v.stopSpeaking();
      setHint('');
      return;
    }

    // Toggle manual recording
    if (v.isRecording) {
      v.stopRecording();
      setHint('');
    } else {
      if (processingRef.current) return;
      autoListenEnabledRef.current = true;
      v.startRecording();
      setHint('Listening… speak, then pause');
    }
  }, []);

  // ── Orb click — same as mic (interrupt or start) ──────────────────────────
  const handleOrbClick = useCallback(() => {
    handleMicClick();
  }, [handleMicClick]);

  // ── Text input ────────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && textInput.trim() && !isProcessing) {
      e.preventDefault();
      const t = textInput.trim();
      autoListenEnabledRef.current = false;
      setTextInput('');
      handleSendMessage(t);
    }
  };

  const handleSendClick = () => {
    const t = textInput.trim();
    if (!t || isProcessing) return;
    autoListenEnabledRef.current = false;
    setTextInput('');
    handleSendMessage(t);
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      autoListenEnabledRef.current = false;
      if (listenAfterRef.current) clearTimeout(listenAfterRef.current);
      voiceRef.current?.stopSpeaking();
      voiceRef.current?.stopRecording();
    };
  }, []);

  // ── New chat — clear everything and re-greet ──────────────────────────────
  const handleNewChat = useCallback(() => {
    // Stop any active audio/recording/timers
    if (listenAfterRef.current) clearTimeout(listenAfterRef.current);
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopRecording();

    // Clear persisted session
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}

    // Reset all state
    setMessages([]);
    setContext({ role: null, lastAtsResults: null, shortlistedIds: [], lastAction: null, pendingAction: null });
    setIsProcessing(false);
    setOrbMode('idle');
    setTextInput('');
    setHint('');
    setResultsData(null);
    autoListenEnabledRef.current = false;

    // Allow greeting to fire again
    hasGreetedRef.current = false;
    msgIndexRef.current = 0;
    interruptedRef.current = false;

    // Trigger greeting on next tick (after state flush)
    setTimeout(() => {
      const n = candidatesSummary.length;
      const greeting = n > 0
        ? `Hey, I'm Jarvis. I can see ${n} resume${n !== 1 ? 's' : ''} loaded. What role are you hiring for?`
        : "Hey, I'm Jarvis. No resumes uploaded yet — head back, add some, then come talk to me.";
      setStatus(n > 0 ? `${n} CANDIDATE${n !== 1 ? 'S' : ''} READY` : 'NO CANDIDATES');
      appendMsg({ role: 'assistant', content: greeting });
      voiceRef.current?.speakText(greeting, msgIndexRef.current++);
      hasGreetedRef.current = true;
    }, 100);
  }, [candidatesSummary, appendMsg]);

  // ── Show ATS results inline (no navigation away) ──────────────────────────
  if (resultsData) {
    return (
      <>
        <style>{CSS}</style>
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#080810' }}>
          <ATSResultsView
            pipelineResult={resultsData}
            onBack={() => setResultsData(null)}
            onRunAgain={() => setResultsData(null)}
          />
        </div>
      </>
    );
  }

  // ── Orb animation ──────────────────────────────────────────────────────────
  const orbAnim = {
    idle:      'jBreathe 4s ease-in-out infinite',
    listening: 'jListen 1s ease-in-out infinite',
    thinking:  'jThink 1.5s ease-in-out infinite',
    speaking:  'jSpeak 0.7s ease-in-out infinite',
  }[orbMode];

  const orbBg = orbMode === 'listening'
    ? 'radial-gradient(circle at 32% 28%, #FDE68A, #F59E0B 48%, #78350F)'
    : 'radial-gradient(circle at 32% 28%, #FDE68A, #D97706 48%, #451A03)';

  const micActive = voice.isRecording || voice.speakingMsgIndex !== null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: '#080810',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        overflow: 'hidden',
      }}>

        {/* Background */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: `radial-gradient(ellipse 120% 80% at 50% -10%, rgba(245,158,11,0.07) 0%, transparent 70%)`,
        }} />
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }} />

        {/* Top-right controls: New Chat + Close */}
        <div style={{
          position: 'absolute', top: 18, right: 18, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {/* New chat button */}
          <button
            onClick={handleNewChat}
            title="Start a new conversation"
            style={{
              height: 34, borderRadius: 10, padding: '0 12px',
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.15)',
              color: '#52525B', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#F59E0B';
              e.currentTarget.style.background = 'rgba(245,158,11,0.12)';
              e.currentTarget.style.borderColor = 'rgba(245,158,11,0.35)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#52525B';
              e.currentTarget.style.background = 'rgba(245,158,11,0.06)';
              e.currentTarget.style.borderColor = 'rgba(245,158,11,0.15)';
            }}
          >
            <RotateCcw size={13} />
            NEW CHAT
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            title="Close Jarvis"
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: '#52525B', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#A1A1AA'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#52525B'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── ZONE 1: Orb ── */}
        <div style={{
          position: 'relative', zIndex: 1, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 44, paddingBottom: 28,
        }}>
          {/* Orb */}
          <div
            onClick={handleOrbClick}
            title={voice.speakingMsgIndex !== null ? 'Click to interrupt' : voice.isRecording ? 'Click to stop' : 'Click to speak'}
            style={{ position: 'relative', width: 120, height: 120, cursor: 'pointer', marginBottom: 18 }}
          >
            {orbMode === 'listening' && [0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '1.5px solid rgba(245,158,11,0.5)',
                animation: `jRipple 2s ease-out ${i * 0.65}s infinite`,
              }} />
            ))}
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: orbBg,
              animation: orbAnim,
              position: 'relative',
              transition: 'background 0.5s ease',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {orbMode === 'speaking' ? (
                  <WaveBars active />
                ) : orbMode === 'thinking' ? (
                  <Loader size={22} style={{ color: 'rgba(255,255,255,0.8)', animation: 'jSpin 1s linear infinite' }} />
                ) : orbMode === 'listening' ? (
                  <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', fontWeight: 200 }}>◎</div>
                ) : (
                  <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.75)', fontWeight: 200 }}>◈</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.32em', color: 'rgba(245,158,11,0.5)', marginBottom: 6 }}>
            JARVIS
          </div>

          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
            color: ['thinking', 'listening'].includes(orbMode) ? '#D97706' : '#3F3F46',
            animation: ['thinking', 'listening'].includes(orbMode) ? 'jStatusFade 1.4s ease-in-out infinite' : 'none',
            minHeight: 14,
          }}>
            {status}
          </div>

          <div style={{
            marginTop: 22, width: '100%', maxWidth: 520, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05) 30%, rgba(245,158,11,0.1) 50%, rgba(255,255,255,0.05) 70%, transparent)',
          }} />
        </div>

        {/* ── ZONE 2: Messages ── */}
        <div style={{
          flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1,
          padding: '12px 0 4px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.05) transparent',
        }}>
          <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 20px' }}>

            {messages.map(msg => {
              // ── Jarvis message
              if (msg.role === 'assistant') return (
                <div key={msg.id} className="j-msg" style={{ marginBottom: 22, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'radial-gradient(circle at 35% 35%, #FDE68A, #D97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: '#451A03', marginTop: 1,
                  }}>J</div>
                  <p style={{
                    margin: 0, flex: 1, fontSize: 15, lineHeight: 1.7,
                    color: '#D4D4D8', fontWeight: 400, letterSpacing: '-0.01em',
                  }}>
                    {msg.content}
                  </p>
                </div>
              );

              // ── User message
              if (msg.role === 'user') {
                if (msg.content?.startsWith('[')) return null;
                return (
                  <div key={msg.id} className="j-msg" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
                    <div style={{
                      background: 'rgba(217,119,6,0.14)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      borderRadius: 100, padding: '8px 18px',
                      maxWidth: '65%', fontSize: 14, fontWeight: 500,
                      color: '#FDE68A', lineHeight: 1.5, wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // ── Action card
              if (msg.role === 'action') {
                if (msg.actionData) {
                  const d = msg.actionData;
                  const rows = (d.results || []).slice(0, 8);
                  const shortlisted = (d.shortlist || []).map(r => r.candidate_id);
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 24 }}>
                      <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(245,158,11,0.12)',
                        borderRadius: 14, padding: '14px 18px',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset',
                      }}>
                        <div style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: '0.16em',
                          color: 'rgba(245,158,11,0.4)', marginBottom: 12,
                        }}>
                          {(d.role || '').toUpperCase()} · {d.total_screened || 0} SCREENED
                        </div>
                        {rows.map((r, i) => (
                          <div key={r.candidate_id || i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '6px 0',
                            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}>
                            <div style={{
                              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                              background: verdictColor(r.verdict),
                              boxShadow: `0 0 6px ${verdictColor(r.verdict)}`,
                            }} />
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#E4E4E7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.name}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: verdictColor(r.verdict), width: 32, textAlign: 'right' }}>
                              {r.ats_score}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: verdictColor(r.verdict), width: 72, textAlign: 'right', opacity: 0.85 }}>
                              {r.verdict}
                            </span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                          {shortlisted.length > 0 && (
                            <button
                              onClick={() => {
                                const count = Math.min(shortlisted.length, 3);
                                handleSendMessageRef.current?.(`Create interviews for the top ${count} candidates`);
                              }}
                              style={{
                                padding: '6px 14px', borderRadius: 100,
                                background: 'rgba(217,119,6,0.2)',
                                border: '1px solid rgba(245,158,11,0.35)',
                                color: '#FDE68A', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              Create interviews for top {Math.min(shortlisted.length, 3)}
                            </button>
                          )}
                          {/* View full results — opens inline, no navigation away */}
                          <button
                            onClick={() => setResultsData(d)}
                            style={{
                              padding: '6px 14px', borderRadius: 100,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.09)',
                              color: '#71717A', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            View full results →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
                // Simple action status line
                return (
                  <div key={msg.id} className="j-msg" style={{
                    marginBottom: 18, padding: '7px 14px',
                    background: 'rgba(74,222,128,0.04)',
                    borderLeft: '2px solid rgba(74,222,128,0.4)',
                    borderRadius: '0 8px 8px 0',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                      color: '#4ADE80', fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      ✓ {msg.content}
                    </span>
                  </div>
                );
              }

              return null;
            })}

            {/* Thinking indicator */}
            {isProcessing && (
              <div className="j-msg" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'radial-gradient(circle at 35% 35%, #FDE68A, #D97706)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#451A03', opacity: 0.5,
                }}>J</div>
                <TypingDots />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── ZONE 3: Input bar ── */}
        <div style={{
          position: 'relative', zIndex: 1, flexShrink: 0,
          padding: '10px 20px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>

          {/* Hint */}
          <div style={{ height: 18, display: 'flex', alignItems: 'center' }}>
            {hint && (
              <div style={{
                fontSize: 11, color: 'rgba(245,158,11,0.6)', letterSpacing: '0.04em',
                animation: 'jStatusFade 2s ease-in-out infinite',
              }}>
                {hint}
              </div>
            )}
          </div>

          {/* Input pill */}
          <div style={{
            display: 'flex', alignItems: 'center',
            width: '100%', maxWidth: 520,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${voice.isRecording ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 100, padding: '5px 5px 5px 20px',
            transition: 'border-color 0.25s, box-shadow 0.25s',
            boxShadow: voice.isRecording ? '0 0 0 3px rgba(245,158,11,0.08)' : 'none',
          }}>
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                voice.isRecording    ? 'Recording… (or type here)' :
                voice.isTranscribing ? 'Transcribing…' :
                isProcessing         ? 'Jarvis is thinking…' :
                'Type a message, or click the mic to speak'
              }
              disabled={isProcessing || voice.isTranscribing}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 14, color: '#A1A1AA', fontFamily: 'inherit',
                caretColor: '#F59E0B',
              }}
            />

            {/* Send button */}
            {textInput.trim() && !isProcessing && (
              <button
                onClick={handleSendClick}
                style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Send size={16} color="#000" />
              </button>
            )}

            {/* Mic button */}
            <button
              onClick={handleMicClick}
              disabled={isProcessing && !micActive}
              title={
                voice.speakingMsgIndex !== null ? 'Click to interrupt Jarvis' :
                voice.isRecording               ? 'Click to stop recording' :
                                                  'Click to speak'
              }
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: voice.isRecording
                  ? 'linear-gradient(135deg, #F59E0B, #92400E)'
                  : voice.speakingMsgIndex !== null
                    ? 'rgba(245,158,11,0.15)'
                    : 'rgba(255,255,255,0.06)',
                border: `1px solid ${voice.isRecording ? 'rgba(245,158,11,0.6)' : 'rgba(255,255,255,0.1)'}`,
                cursor: (isProcessing && !micActive) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: textInput.trim() ? 4 : 0,
                transition: 'all 0.2s',
                boxShadow: voice.isRecording ? '0 0 16px rgba(245,158,11,0.4)' : 'none',
                opacity: (isProcessing && !micActive) ? 0.3 : 1,
              }}
            >
              {voice.isTranscribing
                ? <Loader size={16} style={{ color: '#F59E0B', animation: 'jSpin 1s linear infinite' }} />
                : voice.isRecording
                  ? <MicOff size={16} color="#000" />
                  : <Mic size={16} color={voice.speakingMsgIndex !== null ? '#F59E0B' : 'rgba(255,255,255,0.45)'} />
              }
            </button>
          </div>

          {/* Caption */}
          <div style={{ fontSize: 10, color: '#27272A', letterSpacing: '0.06em', userSelect: 'none' }}>
            {voice.isRecording
              ? 'RECORDING · PAUSE TO SEND AUTOMATICALLY'
              : voice.speakingMsgIndex !== null
                ? 'JARVIS SPEAKING · CLICK ORB OR MIC TO INTERRUPT'
                : 'TYPE OR CLICK MIC TO SPEAK · SILENCE STOPS RECORDING'}
          </div>
        </div>

      </div>
    </>
  );
}

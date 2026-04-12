import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Mic, MicOff, Loader } from 'lucide-react';
import useVoice from '../../hooks/useVoice';

const API_BASE = import.meta.env.PROD ? 'https://resumate-api-74dm.onrender.com' : '';

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
  if (s.includes('strong'))  return '#4ADE80';
  if (s.includes('good'))    return '#38BDF8';
  if (s.includes('consider'))return '#FCD34D';
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
  0%,100% { box-shadow: 0 0 50px 12px rgba(251,191,36,0.5), 0 0 0 0 rgba(251,191,36,0); }
  50%      { box-shadow: 0 0 70px 18px rgba(251,191,36,0.75), 0 0 0 30px rgba(251,191,36,0); }
}
@keyframes jSpeak {
  0%      { transform: scale(1.00); box-shadow: 0 0 55px 12px rgba(251,191,36,0.35); }
  20%     { transform: scale(1.06); box-shadow: 0 0 85px 24px rgba(251,191,36,0.65); }
  50%     { transform: scale(1.03); box-shadow: 0 0 65px 16px rgba(251,191,36,0.5); }
  80%     { transform: scale(1.07); box-shadow: 0 0 90px 26px rgba(251,191,36,0.7); }
  100%    { transform: scale(1.00); box-shadow: 0 0 55px 12px rgba(251,191,36,0.35); }
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

// ── Waveform bars (shown when speaking) ──────────────────────────────────────
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

// ── Three typing dots ─────────────────────────────────────────────────────────
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
  const [messages,      setMessages]      = useState([]);
  const [context,       setContext]       = useState({ role: null, lastAtsResults: null, shortlistedIds: [], lastAction: null });
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [orbMode,       setOrbMode]       = useState('idle');   // idle|listening|thinking|speaking
  const [status,        setStatus]        = useState('');
  const [textInput,     setTextInput]     = useState('');
  const [hint,          setHint]          = useState('');       // bottom hint text

  const hasGreetedRef   = useRef(false);
  const msgIndexRef     = useRef(0);
  const messagesEndRef  = useRef(null);
  const contextRef      = useRef(context);
  const processingRef   = useRef(false);   // sync ref for inside closures

  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { processingRef.current = isProcessing; }, [isProcessing]);

  // ── Voice callbacks ───────────────────────────────────────────────────────
  const handleTranscribed = useCallback((text) => {
    setHint('');
    handleSendMessage(text);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSpeakingDone = useCallback(() => {
    // Auto-start listening after AI finishes speaking
    setTimeout(() => {
      if (!processingRef.current) {
        voice.startRecording();
        setHint('Listening… click mic or press Enter when done');
      }
    }, 320);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTranscribeFail = useCallback((reason) => {
    if (reason === 'too_short') setHint('Tap mic, speak, then tap again to send.');
    else if (reason === 'no_speech') setHint('No speech detected — try again.');
    else if (reason === 'mic_denied') setHint('Microphone access denied. Use the text box.');
  }, []);

  const voice = useVoice({
    apiBase: API_BASE,
    onTranscribed:    handleTranscribed,
    onSpeakingDone:   handleSpeakingDone,
    onTranscribeFail: handleTranscribeFail,
  });

  // Sync orb mode
  useEffect(() => {
    if (voice.isRecording)                    setOrbMode('listening');
    else if (isProcessing)                    setOrbMode('thinking');
    else if (voice.speakingMsgIndex !== null) setOrbMode('speaking');
    else                                      setOrbMode('idle');
  }, [voice.isRecording, voice.isTranscribing, voice.speakingMsgIndex, isProcessing]);

  // ── Append message ────────────────────────────────────────────────────────
  const appendMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: newId(), ...msg }]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  // ── Greeting (once) ───────────────────────────────────────────────────────
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const n = candidatesSummary.length;
    const greeting = n > 0
      ? `Hey. ${n} resume${n !== 1 ? 's' : ''} loaded. What role are we hiring for?`
      : 'Hey. No resumes uploaded yet. Head back, upload some, then come talk to me.';

    setStatus(n > 0 ? `${n} CANDIDATE${n !== 1 ? 'S' : ''} READY` : 'NO CANDIDATES');

    setTimeout(() => {
      appendMsg({ role: 'assistant', content: greeting });
      voice.speakText(greeting, msgIndexRef.current++);
    }, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core message handler ──────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (text) => {
    if (!text?.trim() || processingRef.current) return;

    // Stop AI speaking if user interrupts
    if (voice.speakingMsgIndex !== null) {
      voice.stopSpeaking();
    }
    // Stop recording if it was auto-started
    if (voice.isRecording) voice.stopRecording();

    // Don't show internal system messages to user
    const isSystem = text.startsWith('[');
    if (!isSystem) appendMsg({ role: 'user', content: text });

    setIsProcessing(true);
    setStatus('THINKING');
    setHint('');

    const currentCtx = contextRef.current;

    // Collect conversation history from current messages
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
          },
        }),
      });

      if (!res.ok) throw new Error(`Jarvis API error ${res.status}`);
      const data = await res.json();
      const { reply, action, action_params, awaiting_confirmation, updated_context } = data;

      appendMsg({ role: 'assistant', content: reply });
      voice.speakText(reply, msgIndexRef.current++);   // auto-speak → onSpeakingDone → auto-listen

      if (updated_context) {
        setContext(c => ({
          ...c,
          ...(updated_context.role        ? { role: updated_context.role } : {}),
          ...(updated_context.last_action ? { lastAction: updated_context.last_action } : {}),
        }));
      }

      setIsProcessing(false);
      setStatus(currentCtx.shortlistedIds.length > 0
        ? `${currentCtx.shortlistedIds.length} SHORTLISTED`
        : `${candidatesSummary.length} CANDIDATE${candidatesSummary.length !== 1 ? 'S' : ''} READY`);

      if (action && !awaiting_confirmation) {
        await executeAction(action, action_params || {});
      }

    } catch (err) {
      console.error('Jarvis error:', err);
      const errMsg = `Something went wrong — ${err.message}. Try again.`;
      appendMsg({ role: 'assistant', content: errMsg });
      voice.speakText(errMsg, msgIndexRef.current++);
      setIsProcessing(false);
      setStatus('ERROR');
    }
  }, [candidatesSummary, appendMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action executor ───────────────────────────────────────────────────────
  const executeAction = useCallback(async (action, params) => {
    const token = localStorage.getItem('resumate_hm_token') || '';
    const hdrs  = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    const ctx   = contextRef.current;

    if (action === 'run_ats') {
      setStatus('RUNNING ATS');
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
        if (!res.ok) throw new Error(`Pipeline error ${res.status}`);
        const d = await res.json();
        const shortlisted = (d.shortlist || []).map(r => r.candidate_id);
        setContext(c => ({ ...c, role: params.role || c.role, lastAtsResults: d, shortlistedIds: shortlisted, lastAction: 'run_ats' }));
        appendMsg({ role: 'action', content: `Screened ${d.total_screened} candidates`, actionData: d });
        setStatus(`${shortlisted.length} SHORTLISTED`);
        await handleSendMessage(`[ATS_RESULT] ${buildAtsSummary(d)}`);
      } catch (err) {
        appendMsg({ role: 'action', content: `ATS failed: ${err.message}` });
        setStatus('ERROR');
      }

    } else if (action === 'batch_action') {
      setStatus('CREATING INTERVIEWS');
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
        if (!res.ok) throw new Error(`Batch error ${res.status}`);
        const d = await res.json();
        appendMsg({
          role: 'action',
          content: `Created ${d.interviews_created} interview${d.interviews_created !== 1 ? 's' : ''}` +
                   (params.send_emails ? ` · Sent ${d.emails_sent} email${d.emails_sent !== 1 ? 's' : ''}` : ` · ${d.total} email${d.total !== 1 ? 's' : ''} drafted`),
        });
        setContext(c => ({ ...c, lastAction: 'batch_action' }));
        setStatus('DONE');
        await handleSendMessage(
          `[BATCH_RESULT] Created ${d.interviews_created} interviews. ` +
          (params.send_emails ? `Sent ${d.emails_sent} emails.` : 'Emails drafted, not sent yet.')
        );
      } catch (err) {
        appendMsg({ role: 'action', content: `Batch failed: ${err.message}` });
        setStatus('ERROR');
      }

    } else if (action === 'list_candidates') {
      await handleSendMessage(`[CANDIDATES] ${buildCandidateList(candidatesSummary)}`);

    } else if (action === 'show_results') {
      if (ctx.lastAtsResults) onComplete?.(ctx.lastAtsResults);
      else appendMsg({ role: 'assistant', content: "No results yet. Tell me the role and I'll run the screening." });
    }
  }, [candidatesSummary, appendMsg, handleSendMessage, onComplete]);

  // ── Mic click (toggle) ────────────────────────────────────────────────────
  const handleMicClick = useCallback(() => {
    // If AI is speaking → interrupt and listen
    if (voice.speakingMsgIndex !== null) {
      voice.stopSpeaking();
      setTimeout(() => voice.startRecording(), 100);
      setHint('Listening… click mic again when done');
      return;
    }
    voice.toggleRecording();
    if (!voice.isRecording) {
      setHint('Listening… click mic again when done');
    } else {
      setHint('');
    }
  }, [voice]);

  // ── Text input ────────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && textInput.trim() && !isProcessing) {
      e.preventDefault();
      const t = textInput.trim();
      setTextInput('');
      handleSendMessage(t);
    }
  };

  // ── Orb animation ─────────────────────────────────────────────────────────
  const orbAnim = {
    idle:      'jBreathe 4s ease-in-out infinite',
    listening: 'jListen 1s ease-in-out infinite',
    thinking:  'jThink 1.5s ease-in-out infinite',
    speaking:  'jSpeak 0.7s ease-in-out infinite',
  }[orbMode];

  const orbBg = orbMode === 'listening'
    ? 'radial-gradient(circle at 32% 28%, #FDE68A, #F59E0B 48%, #78350F)'
    : 'radial-gradient(circle at 32% 28%, #FDE68A, #D97706 48%, #451A03)';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: '#080810',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        overflow: 'hidden', userSelect: 'none',
      }}>

        {/* Background texture */}
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

        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 18, right: 18, zIndex: 10,
          width: 34, height: 34, borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          color: '#52525B', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#A1A1AA'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#52525B'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        ><X size={15} /></button>

        {/* ── ZONE 1: Orb ── */}
        <div style={{
          position: 'relative', zIndex: 1, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 44, paddingBottom: 28,
        }}>
          {/* Orb wrapper — clickable to interrupt */}
          <div
            onClick={handleMicClick}
            style={{ position: 'relative', width: 120, height: 120, cursor: 'pointer', marginBottom: 18 }}
          >
            {/* Ripple rings when listening */}
            {orbMode === 'listening' && [0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '1.5px solid rgba(245,158,11,0.5)',
                animation: `jRipple 2s ease-out ${i * 0.65}s infinite`,
              }} />
            ))}

            {/* Orb core */}
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: orbBg,
              animation: orbAnim,
              position: 'relative',
              transition: 'background 0.5s ease',
            }}>
              {/* Inner: waveform when speaking, glyph otherwise */}
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

          {/* Wordmark */}
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.32em',
            color: 'rgba(245,158,11,0.5)', marginBottom: 6,
          }}>
            JARVIS
          </div>

          {/* Status */}
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
            color: ['thinking', 'listening'].includes(orbMode) ? '#D97706' : '#3F3F46',
            animation: ['thinking', 'listening'].includes(orbMode) ? 'jStatusFade 1.4s ease-in-out infinite' : 'none',
            minHeight: 14,
          }}>
            {status}
          </div>

          {/* Divider */}
          <div style={{
            marginTop: 22, width: '100%', maxWidth: 520,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05) 30%, rgba(245,158,11,0.1) 50%, rgba(255,255,255,0.05) 70%, transparent)',
          }} />
        </div>

        {/* ── ZONE 2: Conversation ── */}
        <div style={{
          flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1,
          padding: '12px 0 4px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.05) transparent',
        }}>
          <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 20px' }}>

            {messages.map(msg => {
              // AI message
              if (msg.role === 'assistant') return (
                <div key={msg.id} className="j-msg" style={{ marginBottom: 22, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'radial-gradient(circle at 35% 35%, #FDE68A, #D97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: '#451A03', marginTop: 1,
                  }}>J</div>
                  <p style={{
                    margin: 0, flex: 1,
                    fontSize: 15, lineHeight: 1.7,
                    color: '#D4D4D8', fontWeight: 400,
                    letterSpacing: '-0.01em',
                  }}>
                    {msg.content}
                  </p>
                </div>
              );

              // User message — hide internal system messages
              if (msg.role === 'user') {
                if (msg.content?.startsWith('[')) return null;
                return (
                  <div key={msg.id} className="j-msg" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
                    <div style={{
                      background: 'rgba(217,119,6,0.14)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      borderRadius: 100, padding: '8px 18px',
                      maxWidth: '65%',
                      fontSize: 14, fontWeight: 500,
                      color: '#FDE68A', lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Action card
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
                              onClick={() => handleSendMessage(`Create interviews for the top ${Math.min(shortlisted.length, 3)} candidates`)}
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
                          <button
                            onClick={() => onComplete?.(d)}
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
                // Plain log line
                return (
                  <div key={msg.id} className="j-msg" style={{
                    marginBottom: 18,
                    padding: '7px 14px',
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

            {/* Thinking dots */}
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

        {/* ── ZONE 3: Input ── */}
        <div style={{
          position: 'relative', zIndex: 1, flexShrink: 0,
          padding: '10px 20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          {/* Hint text */}
          {hint && (
            <div style={{
              fontSize: 11, color: 'rgba(245,158,11,0.55)', letterSpacing: '0.04em',
              animation: 'jStatusFade 2s ease-in-out infinite',
            }}>
              {hint}
            </div>
          )}

          {/* Input pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            width: '100%', maxWidth: 520,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${voice.isRecording ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 100, padding: '5px 5px 5px 20px',
            transition: 'border-color 0.25s',
            boxShadow: voice.isRecording ? '0 0 0 3px rgba(245,158,11,0.08)' : 'none',
          }}>
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                voice.isRecording    ? 'Recording… click mic to send' :
                voice.isTranscribing ? 'Processing…' :
                isProcessing         ? 'Thinking…' :
                'Or type here and press Enter'
              }
              disabled={isProcessing || voice.isTranscribing}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 14, color: '#A1A1AA', fontFamily: 'inherit',
                caretColor: '#F59E0B',
              }}
            />

            {/* Send (when typing) */}
            {textInput.trim() && (
              <button
                onClick={() => { const t = textInput.trim(); setTextInput(''); handleSendMessage(t); }}
                disabled={isProcessing}
                style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: isProcessing ? 0.4 : 1,
                }}
              ><Send size={16} color="#000" /></button>
            )}

            {/* Mic (always visible, click-to-toggle) */}
            <button
              onClick={handleMicClick}
              disabled={isProcessing && !voice.isRecording}
              title={voice.isRecording ? 'Click to stop and send' : 'Click to speak'}
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: voice.isRecording
                  ? 'linear-gradient(135deg, #F59E0B, #92400E)'
                  : voice.speakingMsgIndex !== null
                    ? 'rgba(245,158,11,0.2)'
                    : 'rgba(255,255,255,0.06)',
                border: `1px solid ${voice.isRecording ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: textInput.trim() ? 4 : 0,
                transition: 'all 0.2s',
                boxShadow: voice.isRecording ? '0 0 16px rgba(245,158,11,0.4)' : 'none',
                opacity: (isProcessing && !voice.isRecording) ? 0.3 : 1,
              }}
            >
              {voice.isTranscribing
                ? <Loader size={16} style={{ color: '#F59E0B', animation: 'jSpin 1s linear infinite' }} />
                : voice.isRecording
                  ? <MicOff size={16} color="#000" />
                  : <Mic size={16} color="rgba(255,255,255,0.5)" />}
            </button>
          </div>

          {/* Caption */}
          <div style={{ fontSize: 10, color: '#27272A', letterSpacing: '0.06em' }}>
            {voice.isRecording
              ? 'RECORDING · CLICK MIC TO SEND'
              : voice.speakingMsgIndex !== null
                ? 'JARVIS SPEAKING · CLICK ORB OR MIC TO INTERRUPT'
                : 'CLICK ORB OR MIC TO SPEAK · TYPE AND PRESS ENTER'}
          </div>
        </div>

      </div>
    </>
  );
}

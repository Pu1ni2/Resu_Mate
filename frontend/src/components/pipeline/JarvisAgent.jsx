import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Mic, MicOff, Loader } from 'lucide-react';
import useVoice from '../../hooks/useVoice';

const API_BASE = import.meta.env.PROD ? 'https://resumate-api-74dm.onrender.com' : '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAtsSummary(data) {
  const { stats = {}, results = [], role = '', total_screened = 0 } = data;
  const top = (results || []).slice(0, 5)
    .map(r => `${r.name} scored ${r.ats_score} (${r.verdict})`)
    .join(', ');
  return `ATS complete for ${role}. Screened ${total_screened} candidates. ${stats.strong_fit || 0} Strong Fit, ${stats.good_fit || 0} Good Fit, ${stats.consider || 0} Consider, ${stats.no_match || 0} No Match. Top results: ${top}.`;
}

function buildCandidateList(candidates) {
  if (!candidates.length) return 'No candidates uploaded yet.';
  return candidates.map(c => `${c.name} (${c.predicted_role || 'Unknown role'}, ${c.total_experience_years || 0}y exp)`).join('; ');
}

function verdictColor(verdict) {
  if (!verdict) return '#64748B';
  const v = verdict.toLowerCase();
  if (v.includes('strong')) return '#34D399';
  if (v.includes('good'))   return '#60A5FA';
  if (v.includes('consider')) return '#FBBF24';
  return '#F87171';
}

function verdictDot(verdict) {
  if (!verdict) return '·';
  const v = verdict.toLowerCase();
  if (v.includes('strong')) return '●';
  if (v.includes('good'))   return '●';
  if (v.includes('consider')) return '─';
  return '✕';
}

let msgIdCounter = 0;
function newId() { return ++msgIdCounter; }

// ── CSS (injected once) ───────────────────────────────────────────────────────

const JARVIS_CSS = `
@keyframes orbBreathe {
  0%,100% {
    transform: scale(1);
    box-shadow: 0 0 60px 15px rgba(139,92,246,0.35), 0 0 120px 40px rgba(99,102,241,0.12);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 90px 25px rgba(139,92,246,0.6), 0 0 180px 60px rgba(99,102,241,0.22);
  }
}
@keyframes orbSpeak {
  0%,100% { transform: scale(1.01); box-shadow: 0 0 70px 18px rgba(139,92,246,0.5), 0 0 140px 50px rgba(99,102,241,0.18); }
  30%      { transform: scale(1.06); box-shadow: 0 0 100px 30px rgba(139,92,246,0.75), 0 0 200px 70px rgba(99,102,241,0.28); }
  70%      { transform: scale(1.03); box-shadow: 0 0 80px 22px rgba(139,92,246,0.6); }
}
@keyframes orbThink {
  0%   { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
@keyframes orbFlash {
  0%,100% { box-shadow: 0 0 60px 15px rgba(52,211,153,0); }
  50%      { box-shadow: 0 0 100px 40px rgba(52,211,153,0.55); }
}
@keyframes rippleRing {
  0%   { transform: scale(1);   opacity: 0.55; }
  100% { transform: scale(2.6); opacity: 0; }
}
@keyframes msgIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes statusBlink {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
@keyframes jarvisSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.jarvis-msg { animation: msgIn 0.28s cubic-bezier(0.16,1,0.3,1) both; }
.jarvis-status-pulse { animation: statusBlink 1.2s ease-in-out infinite; }
.jarvis-thinking-orb { animation: orbThink 2s linear infinite; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function JarvisAgent({ candidatesSummary = [], onClose, onComplete }) {
  const [messages, setMessages]           = useState([]);
  const [context, setContext]             = useState({ role: null, lastAtsResults: null, shortlistedIds: [], lastAction: null });
  const [isProcessing, setIsProcessing]   = useState(false);
  const [status, setStatus]               = useState('');
  const [orbMode, setOrbMode]             = useState('idle');   // idle|listening|thinking|speaking|done
  const [textInput, setTextInput]         = useState('');
  const [awaitingConf, setAwaitingConf]   = useState(false);

  const msgIndexRef    = useRef(0);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const contextRef     = useRef(context);

  // keep ref in sync for use inside async closures
  useEffect(() => { contextRef.current = context; }, [context]);

  // ── Voice hook ──────────────────────────────────────────────────────────────
  const voice = useVoice({
    apiBase: API_BASE,
    onTranscribed: useCallback((text) => {
      if (text && text.trim()) handleSendMessage(text.trim());
    }, []),  // eslint-disable-line react-hooks/exhaustive-deps
  });

  // Sync orb mode with voice state
  useEffect(() => {
    if (voice.isRecording)                         setOrbMode('listening');
    else if (isProcessing)                         setOrbMode('thinking');
    else if (voice.speakingMsgIndex !== null)      setOrbMode('speaking');
    else                                           setOrbMode('idle');
  }, [voice.isRecording, voice.isTranscribing, voice.speakingMsgIndex, isProcessing]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const appendMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: newId(), ...msg }]);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  useEffect(scrollToBottom, [messages]);

  // ── Opening greeting ────────────────────────────────────────────────────────
  useEffect(() => {
    const n = candidatesSummary.length;
    const greeting = n > 0
      ? `Hey. I can see ${n} resume${n !== 1 ? 's' : ''} loaded. What role are we screening for?`
      : `Hey. No resumes uploaded yet. Head back and upload some, then I can get to work.`;

    const initialStatus = n > 0
      ? `READY — ${n} CANDIDATE${n !== 1 ? 'S' : ''} LOADED`
      : 'READY — NO CANDIDATES';
    setStatus(initialStatus);

    setTimeout(() => {
      appendMsg({ role: 'assistant', content: greeting });
      voice.speakText(greeting, msgIndexRef.current++);
    }, 500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core send loop ──────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (text) => {
    if (!text || isProcessing) return;

    appendMsg({ role: 'user', content: text });
    setIsProcessing(true);
    setStatus('THINKING...');

    const currentContext = contextRef.current;

    const history = [];
    setMessages(prev => {
      prev.forEach(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          history.push({ role: m.role, content: m.content });
        }
      });
      return prev;
    });

    try {
      const token = localStorage.getItem('resumate_hm_token') || '';
      const res = await fetch(`${API_BASE}/api/jarvis/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          conversation_history: history,
          candidates_summary: candidatesSummary,
          context: {
            role: currentContext.role,
            last_ats_results: currentContext.lastAtsResults,
            shortlisted_ids: currentContext.shortlistedIds,
            last_action: currentContext.lastAction,
          },
        }),
      });

      if (!res.ok) throw new Error(`Jarvis API error: ${res.status}`);
      const data = await res.json();

      const { reply, action, action_params, awaiting_confirmation, updated_context } = data;

      // Append AI reply
      appendMsg({ role: 'assistant', content: reply });

      // Speak it
      voice.speakText(reply, msgIndexRef.current++);

      // Update context
      if (updated_context) {
        setContext(c => ({
          ...c,
          ...( updated_context.role        ? { role: updated_context.role } : {} ),
          ...( updated_context.last_action ? { lastAction: updated_context.last_action } : {} ),
        }));
      }

      setAwaitingConf(!!awaiting_confirmation);
      setIsProcessing(false);
      setStatus(currentContext.shortlistedIds.length > 0
        ? `DONE — ${currentContext.shortlistedIds.length} SHORTLISTED`
        : `READY — ${candidatesSummary.length} CANDIDATE${candidatesSummary.length !== 1 ? 'S' : ''} LOADED`);

      // Execute action if signalled and no confirmation needed
      if (action && !awaiting_confirmation) {
        await executeAction(action, action_params || {});
      }

    } catch (err) {
      console.error('Jarvis error:', err);
      appendMsg({ role: 'assistant', content: `Something went wrong — ${err.message}. Try again.` });
      setIsProcessing(false);
      setStatus('ERROR — TRY AGAIN');
    }
  }, [isProcessing, candidatesSummary, appendMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal: feed result back through Jarvis ───────────────────────────────
  const sendToJarvis = useCallback(async (systemMessage) => {
    await handleSendMessage(systemMessage);
  }, [handleSendMessage]);

  // ── Action executor ─────────────────────────────────────────────────────────
  const executeAction = useCallback(async (action, params) => {
    const token = localStorage.getItem('resumate_hm_token') || '';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    const currentContext = contextRef.current;

    if (action === 'run_ats') {
      setStatus('RUNNING ATS PIPELINE');
      try {
        const res = await fetch(`${API_BASE}/api/pipeline/run`, {
          method: 'POST', headers,
          body: JSON.stringify({
            role: params.role || currentContext.role || 'Engineer',
            jd_text: params.jd_text || null,
            required_skills: params.required_skills || [],
            min_experience_years: params.min_experience_years || 0,
            auto_shortlist_count: params.auto_shortlist_count || 5,
          }),
        });
        if (!res.ok) throw new Error(`Pipeline error ${res.status}`);
        const data = await res.json();

        const shortlisted = (data.shortlist || []).map(r => r.candidate_id);
        setContext(c => ({
          ...c,
          role: params.role || c.role,
          lastAtsResults: data,
          shortlistedIds: shortlisted,
          lastAction: 'run_ats',
        }));

        // Append inline result card
        appendMsg({
          role: 'action',
          content: `ATS complete — ${data.total_screened} screened`,
          actionData: data,
        });

        setStatus(`DONE — ${shortlisted.length} SHORTLISTED`);
        await sendToJarvis(`[ATS_RESULT] ${buildAtsSummary(data)}`);

      } catch (err) {
        appendMsg({ role: 'action', content: `ATS failed: ${err.message}` });
        setStatus('ERROR');
      }

    } else if (action === 'batch_action') {
      setStatus('CREATING INTERVIEWS');
      try {
        const res = await fetch(`${API_BASE}/api/pipeline/batch-action`, {
          method: 'POST', headers,
          body: JSON.stringify({
            candidate_ids: params.candidate_ids || currentContext.shortlistedIds,
            role: params.role || currentContext.role || 'Engineer',
            level: params.level || 'Mid-Level',
            num_questions: params.num_questions || 8,
            email_type: params.email_type || 'interview',
            send_emails: params.send_emails || false,
          }),
        });
        if (!res.ok) throw new Error(`Batch action error ${res.status}`);
        const data = await res.json();

        appendMsg({
          role: 'action',
          content: `Created ${data.interviews_created} interview${data.interviews_created !== 1 ? 's' : ''}, drafted ${data.total} email${data.total !== 1 ? 's' : ''}${params.send_emails ? ` — ${data.emails_sent} sent` : ''}`,
          actionData: null,
        });

        setContext(c => ({ ...c, lastAction: 'batch_action' }));
        setStatus('READY');
        await sendToJarvis(
          `[BATCH_RESULT] Created ${data.interviews_created} interviews. Drafted ${data.total} emails.` +
          (params.send_emails ? ` Sent ${data.emails_sent} emails.` : ' Emails not sent yet.')
        );

      } catch (err) {
        appendMsg({ role: 'action', content: `Batch action failed: ${err.message}` });
        setStatus('ERROR');
      }

    } else if (action === 'list_candidates') {
      const summary = buildCandidateList(candidatesSummary);
      await sendToJarvis(`[CANDIDATES] ${summary}`);

    } else if (action === 'show_results') {
      if (currentContext.lastAtsResults) {
        onComplete?.(currentContext.lastAtsResults);
      } else {
        appendMsg({ role: 'assistant', content: "No ATS results yet. Let's run a pipeline first — what role are we hiring for?" });
      }
    }
  }, [candidatesSummary, appendMsg, sendToJarvis, onComplete]);

  // ── Input handlers ──────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && textInput.trim() && !isProcessing) {
      e.preventDefault();
      const txt = textInput.trim();
      setTextInput('');
      handleSendMessage(txt);
    }
  };

  const handleMicDown = () => {
    if (isProcessing) return;
    voice.startRecording();
  };

  const handleMicUp = () => {
    voice.stopRecording();
  };

  // ── Orb animation class ─────────────────────────────────────────────────────
  const orbAnimStyle = () => {
    if (orbMode === 'speaking')  return { animation: 'orbSpeak 0.5s ease-in-out infinite' };
    if (orbMode === 'thinking')  return { animation: 'orbThink 2s linear infinite' };
    if (orbMode === 'done')      return { animation: 'orbFlash 0.8s ease-in-out 2' };
    return { animation: 'orbBreathe 3.5s ease-in-out infinite' };
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{JARVIS_CSS}</style>

      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: '#05050A',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'DM Sans', sans-serif",
        overflow: 'hidden',
      }}>

        {/* Subtle grid background */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
        }} />

        {/* Ambient glow behind orb */}
        <div style={{
          position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(109,40,217,0.18) 0%, transparent 70%)',
          zIndex: 0, pointerEvents: 'none',
        }} />

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 10,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '7px 9px',
            color: '#52525B', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#A1A1AA'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#52525B'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          <X size={16} />
        </button>

        {/* ── Zone 1: Command (orb + status) ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 48, paddingBottom: 32, flexShrink: 0,
        }}>

          {/* Orb container */}
          <div style={{ position: 'relative', width: 140, height: 140, marginBottom: 20 }}>

            {/* Sonar rings — listening mode */}
            {orbMode === 'listening' && [0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute',
                inset: 0, borderRadius: '50%',
                border: '1px solid rgba(139,92,246,0.45)',
                animation: `rippleRing 1.6s ease-out ${i * 0.52}s infinite`,
              }} />
            ))}

            {/* Orb core */}
            <div style={{
              width: 140, height: 140, borderRadius: '50%',
              background: orbMode === 'listening'
                ? 'radial-gradient(circle at 35% 35%, #F87171, #EF4444 50%, #7F1D1D)'
                : 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 50%, #3B0764)',
              position: 'relative',
              transition: 'background 0.4s ease',
              ...orbAnimStyle(),
            }}>
              {/* Inner glyph */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, color: 'rgba(255,255,255,0.85)', fontWeight: 200,
                letterSpacing: '-0.02em', userSelect: 'none',
              }}>
                {orbMode === 'thinking'
                  ? <Loader size={28} style={{ color: 'rgba(255,255,255,0.7)', animation: 'jarvisSpin 1s linear infinite' }} />
                  : '◈'}
              </div>
            </div>
          </div>

          {/* JARVIS wordmark */}
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
            color: '#6D28D9', marginBottom: 10,
          }}>
            JARVIS
          </div>

          {/* Status line */}
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
            color: orbMode === 'thinking' || orbMode === 'listening' ? '#8B5CF6' : '#3F3F46',
            ...(orbMode === 'thinking' || orbMode === 'listening' ? { animation: 'statusBlink 1.2s ease-in-out infinite' } : {}),
          }}>
            {status}
          </div>

          {/* Divider */}
          <div style={{
            marginTop: 24, width: '100%', maxWidth: 560,
            height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
          }} />
        </div>

        {/* ── Zone 2: Conversation ── */}
        <div style={{
          flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1,
          padding: '16px 0 8px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.06) transparent',
        }}>
          <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 24px' }}>

            {messages.map((msg) => {
              if (msg.role === 'assistant') {
                return (
                  <div key={msg.id} className="jarvis-msg" style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 14, color: '#7C3AED', flexShrink: 0, marginTop: 1, userSelect: 'none' }}>◈</span>
                      <p style={{
                        margin: 0, fontSize: 15, lineHeight: 1.65,
                        color: '#D4D4D8', fontWeight: 400,
                        letterSpacing: '-0.01em',
                      }}>
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              }

              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="jarvis-msg" style={{
                    display: 'flex', justifyContent: 'flex-end', marginBottom: 20,
                  }}>
                    <div style={{
                      background: 'rgba(109,40,217,0.18)',
                      border: '1px solid rgba(139,92,246,0.3)',
                      borderRadius: 100,
                      padding: '8px 20px',
                      maxWidth: '60%',
                      fontSize: 14, color: '#C4B5FD', fontWeight: 500,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}>
                      {/* Hide system messages from user (ATS_RESULT, BATCH_RESULT, etc.) */}
                      {msg.content.startsWith('[') ? null : msg.content}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'action') {
                // Inline ATS result card
                if (msg.actionData) {
                  const d = msg.actionData;
                  const results = d.results || [];
                  const shortlisted = (d.shortlist || []).map(r => r.candidate_id);
                  return (
                    <div key={msg.id} className="jarvis-msg" style={{ marginBottom: 24 }}>
                      <div style={{
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 16,
                        padding: '16px 20px',
                        overflow: 'hidden',
                      }}>
                        {/* Card header */}
                        <div style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                          color: '#52525B', marginBottom: 14,
                        }}>
                          {(d.role || '').toUpperCase()} · {d.total_screened || 0} SCREENED
                        </div>

                        {/* Candidate rows */}
                        <div style={{ marginBottom: 14 }}>
                          {results.slice(0, 8).map((r, i) => (
                            <div key={r.candidate_id || i} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '7px 0',
                              borderBottom: i < Math.min(results.length, 8) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                            }}>
                              {/* Dot */}
                              <span style={{
                                fontSize: 12, color: verdictColor(r.verdict),
                                width: 14, flexShrink: 0, textAlign: 'center',
                              }}>
                                {verdictDot(r.verdict)}
                              </span>
                              {/* Name */}
                              <span style={{
                                flex: 1, fontSize: 13, fontWeight: 600,
                                color: '#E4E4E7', overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {r.name}
                              </span>
                              {/* Score */}
                              <span style={{
                                fontSize: 13, fontWeight: 800,
                                color: verdictColor(r.verdict), width: 34, textAlign: 'right',
                              }}>
                                {r.ats_score}
                              </span>
                              {/* Verdict */}
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                                color: verdictColor(r.verdict), width: 80, textAlign: 'right',
                                textTransform: 'uppercase', opacity: 0.9,
                              }}>
                                {r.verdict}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {shortlisted.length > 0 && (
                            <button
                              onClick={() => handleSendMessage(`Create interviews for the top ${Math.min(shortlisted.length, 3)} candidates`)}
                              style={{
                                padding: '7px 16px', borderRadius: 100,
                                background: 'rgba(109,40,217,0.25)',
                                border: '1px solid rgba(139,92,246,0.4)',
                                color: '#C4B5FD', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Create interviews for top {Math.min(shortlisted.length, 3)}
                            </button>
                          )}
                          <button
                            onClick={() => onComplete?.(d)}
                            style={{
                              padding: '7px 16px', borderRadius: 100,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#71717A', fontSize: 12, fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            View all results →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Plain action log row (no data card)
                return (
                  <div key={msg.id} className="jarvis-msg" style={{
                    marginBottom: 16,
                    padding: '8px 14px',
                    background: 'rgba(52,211,153,0.05)',
                    borderLeft: '2px solid rgba(52,211,153,0.4)',
                    borderRadius: '0 8px 8px 0',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                      color: '#34D399', fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      ✓ {msg.content}
                    </span>
                  </div>
                );
              }

              return null;
            })}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="jarvis-msg" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 14, color: '#7C3AED', flexShrink: 0 }}>◈</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#6D28D9',
                      animation: `statusBlink 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Divider before input */}
        <div style={{
          width: '100%', maxWidth: 560, margin: '0 auto',
          height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
          flexShrink: 0, position: 'relative', zIndex: 1,
        }} />

        {/* ── Zone 3: Input bar ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          padding: '16px 24px 28px',
          display: 'flex', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            width: '100%', maxWidth: 560,
            background: 'rgba(255,255,255,0.035)',
            border: `1px solid ${voice.isRecording ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 100,
            padding: '6px 6px 6px 22px',
            transition: 'border-color 0.2s',
          }}>

            {/* Text input — always present */}
            <input
              ref={inputRef}
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                voice.isRecording    ? 'Listening...' :
                voice.isTranscribing ? 'Transcribing...' :
                isProcessing         ? 'Jarvis is thinking...' :
                'Hold ● to speak or type here...'
              }
              disabled={isProcessing || voice.isRecording || voice.isTranscribing}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#A1A1AA', fontSize: 14, fontFamily: 'inherit',
                caretColor: '#8B5CF6',
              }}
            />

            {/* Right side: mic button OR send arrow */}
            {textInput.trim() ? (
              <button
                onClick={() => { const t = textInput.trim(); setTextInput(''); handleSendMessage(t); }}
                disabled={isProcessing}
                style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'opacity 0.15s',
                  opacity: isProcessing ? 0.5 : 1,
                }}
              >
                <Send size={18} color="#fff" />
              </button>
            ) : (
              <button
                onMouseDown={handleMicDown}
                onMouseUp={handleMicUp}
                onTouchStart={handleMicDown}
                onTouchEnd={handleMicUp}
                disabled={isProcessing || voice.isTranscribing}
                style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: voice.isRecording
                    ? 'linear-gradient(135deg, #EF4444, #B91C1C)'
                    : 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s',
                  opacity: (isProcessing || voice.isTranscribing) ? 0.4 : 1,
                  boxShadow: voice.isRecording ? '0 0 20px rgba(239,68,68,0.4)' : 'none',
                }}
              >
                {voice.isTranscribing
                  ? <Loader size={18} color="rgba(255,255,255,0.7)" style={{ animation: 'jarvisSpin 1s linear infinite' }} />
                  : voice.isRecording
                    ? <MicOff size={18} color="#fff" />
                    : <Mic size={18} color="#fff" />}
              </button>
            )}
          </div>
        </div>

      </div>
    </>
  );
}

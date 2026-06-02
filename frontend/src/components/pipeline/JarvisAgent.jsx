import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Mic, MicOff, Loader, RotateCcw, Maximize2 } from 'lucide-react';
import useVoice from '../../hooks/useVoice';
import ATSResultsView from './ATSResultsView';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';
const SESSION_KEY = 'jarvis_session_v3';
const AUTO_LISTEN_DELAY_MS = 900;
const AUTO_RETRY_DELAY_MS = 650;
const HANDS_FREE_DEFAULT = true;

// â”€â”€ Transcription quality filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Markdown renderer (for eval reports and other agent outputs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { elements.push(<div key={i} style={{ height: 8 }} />); i++; continue; }

    // h2 / h3
    if (/^#{2,3}\s/.test(line)) {
      const level = line.match(/^(#{2,3})/)[1].length;
      const txt = line.replace(/^#{2,3}\s*/, '').replace(/[ðŸŽ¯ðŸ“Šâœ…âš ï¸âŒðŸ’¡ðŸ”]/gu, '').trim();
      elements.push(
        <div key={i} style={{ fontSize: level === 2 ? 15 : 13, fontWeight: 800, color: level === 2 ? '#E4E4E7' : '#A1A1AA', marginTop: 16, marginBottom: 4, letterSpacing: '-0.01em' }}>
          {txt}
        </div>
      );
      i++; continue;
    }
    // List items
    if (/^[\-\*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && (/^[\-\*]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
        items.push(lines[i].replace(/^[\-\*\d\.]+\s*/, ''));
        i++;
      }
      elements.push(
        <ul key={i} style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
          {items.map((it, j) => (
            <li key={j} style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.7, marginBottom: 2 }}>
              {it.replace(/\*\*([^*]+)\*\*/g, '$1')}
            </li>
          ))}
        </ul>
      );
      continue;
    }
    // Normal paragraph with inline bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    elements.push(
      <p key={i} style={{ margin: '0 0 6px', fontSize: 13, color: '#A1A1AA', lineHeight: 1.7 }}>
        {parts.map((p, j) =>
          p.startsWith('**') ? <strong key={j} style={{ color: '#D4D4D8', fontWeight: 700 }}>{p.slice(2, -2)}</strong> : p
        )}
      </p>
    );
    i++;
  }
  return <div>{elements}</div>;
}

// â”€â”€ Close-out detector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns true when Jarvis's reply is a conversational sign-off, so the caller
// can auto-close the panel after TTS finishes.
const CLOSEOUT_PATTERNS = [
  /\bhave a (good|great|nice) (day|one|evening|night)\b/i,
  /\btalk (to you )?(later|soon)\b/i,
  /\bgoodbye\b/i,
  /\bbye( now| for now)?\b/i,
  /\bsee you (later|soon)\b/i,
  /\bcatch you (later|soon)\b/i,
  /\btake care\b/i,
];
function shouldCloseChat(reply) {
  if (!reply || typeof reply !== 'string') return false;
  const t = reply.trim();
  // Only treat short, standalone farewells as close-outs. Longer replies and
  // replies ending in a question are always mid-conversation.
  if (t.length > 120) return false;
  if (/\?\s*$/.test(t)) return false;
  return CLOSEOUT_PATTERNS.some(re => re.test(t));
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ðŸŽ¯ðŸ“Šâœ…âš ï¸âŒðŸ’¡ðŸ”ðŸ”„ðŸŒðŸ“Œ]/gu, '')
    .replace(/^[\-\*]\s/gm, 'â€¢ ')
    .trim();
}

// Extract a markdown section by keywords â€” handles any header format
function extractSection(text, keywords) {
  const lines = text.split('\n');
  let inSection = false;
  const content = [];
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) {
      const lower = line.toLowerCase().replace(/[ðŸŽ¯ðŸ“Šâœ…âš ï¸âŒðŸ’¡ðŸ”ðŸ”„ðŸŒðŸ“Œ]/gu, '');
      const matches = keywords.some(kw => lower.includes(kw));
      if (matches) { inSection = true; continue; }
      if (inSection) break; // hit next section â€” stop
      inSection = false;
    } else if (inSection && line.trim()) {
      content.push(line);
    }
  }
  return stripMarkdown(content.join('\n').trim()) || null;
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function createDefaultJarvisContext() {
  return {
    role: null,
    lastAtsResults: null,
    shortlistedIds: [],
    lastAction: null,
    pendingAction: null,
    activeCandidateId: null,
    activeCandidateName: null,
    interrupted: false,
    artifacts: {
      github: {},
      scans: {},
      evaluations: {},
      resumeIntel: {},
      interviews: {},
      interviewReports: {},
      credibility: {},
      research: {},
    },
  };
}

function normalizeContextPatch(patch = {}) {
  const next = { ...(patch || {}) };

  if (next.last_ats_results !== undefined && next.lastAtsResults === undefined) next.lastAtsResults = next.last_ats_results;
  if (next.shortlisted_ids !== undefined && next.shortlistedIds === undefined) next.shortlistedIds = next.shortlisted_ids;
  if (next.last_action !== undefined && next.lastAction === undefined) next.lastAction = next.last_action;
  if (next.pending_action !== undefined && next.pendingAction === undefined) next.pendingAction = next.pending_action;
  if (next.active_candidate_id !== undefined && next.activeCandidateId === undefined) next.activeCandidateId = next.active_candidate_id;
  if (next.active_candidate_name !== undefined && next.activeCandidateName === undefined) next.activeCandidateName = next.active_candidate_name;

  delete next.last_ats_results;
  delete next.shortlisted_ids;
  delete next.last_action;
  delete next.pending_action;
  delete next.active_candidate_id;
  delete next.active_candidate_name;

  return next;
}

function mergeArtifacts(current = {}, patch = {}) {
  const next = { ...current };
  Object.entries(patch || {}).forEach(([bucket, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[bucket] = { ...(current?.[bucket] || {}), ...value };
    } else {
      next[bucket] = value;
    }
  });
  return next;
}

function mergeJarvisContext(current, patch = {}) {
  const normalized = normalizeContextPatch(patch);
  const next = { ...current, ...normalized };
  if (normalized.shortlistedIds !== undefined) next.shortlistedIds = normalized.shortlistedIds;
  if (normalized.lastAtsResults !== undefined) next.lastAtsResults = normalized.lastAtsResults;
  if (normalized.pendingAction !== undefined) next.pendingAction = normalized.pendingAction;
  if (normalized.artifacts) next.artifacts = mergeArtifacts(current?.artifacts, normalized.artifacts);
  else next.artifacts = current?.artifacts || createDefaultJarvisContext().artifacts;
  return next;
}

function normalizeSavedContext(raw) {
  return mergeJarvisContext(createDefaultJarvisContext(), raw || {});
}

function extractScore(text) {
  const match = String(text || '').match(/(?:overall\s+fit\s+score|fit\s+score|overall\s+score)[^:]*?:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function extractVerdict(text) {
  const match = String(text || '').match(/recommendation[^:]*?:\s*([^\n]{3,50})/i);
  return match ? stripMarkdown(match[1].trim()).split('\n')[0] : '';
}

function buildEvaluationArtifact(report, role) {
  const strengths = (extractSection(report, ['strength', 'match']) || '')
    .split(/[.;]\s+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  const weaknesses = (extractSection(report, ['growth', 'area', 'concern', 'weakness', 'drawback', 'improvement', 'gap', 'limitation']) || '')
    .split(/[.;]\s+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  return {
    role: role || '',
    score: extractScore(report),
    verdict: extractVerdict(report),
    strengths,
    weaknesses,
    summary: stripMarkdown(report).slice(0, 320),
    report,
  };
}

function buildResumeIntelArtifact(intel) {
  return {
    confidence: intel?.resume_confidence_score || 0,
    gaps: (intel?.gaps || []).map(g => g.detail).filter(Boolean).slice(0, 3),
    redFlags: (intel?.red_flags || []).slice(0, 3),
    verificationTargets: (intel?.verification_targets || []).map(t => t.skill || t.claim).filter(Boolean).slice(0, 4),
    intelligence: intel,
  };
}

function buildInterviewArtifact(config = {}, candidateEmail = '') {
  return {
    candidateEmail,
    role: config.role || '',
    level: config.level || '',
    numQuestions: config.num_questions || config.numQuestions || 0,
    focusAreas: config.focus_areas || config.focusAreas || [],
    status: config.status || 'pending',
    config,
  };
}

function buildInterviewReportArtifact(report = {}, candidateEmail = '') {
  const scores = Array.isArray(report.scores) ? report.scores : [];
  const avgScore = report.avgScore || (scores.length
    ? Number((scores.reduce((sum, item) => sum + (item?.score || 0), 0) / scores.length).toFixed(1))
    : null);
  return {
    candidateEmail,
    avgScore,
    eyeContact: report.eyeContact || 0,
    violations: report.violations || 0,
    summary: stripMarkdown(report.report || '').slice(0, 320),
    report,
  };
}

function buildCredibilityArtifact(credibility = {}, candidateEmail = '') {
  return {
    candidateEmail,
    credibilityScore: credibility.credibility_score || 0,
    recommendation: credibility.hiring_recommendation || '',
    keyInsights: (credibility.key_insights || []).slice(0, 3),
    details: credibility,
  };
}

function buildResearchArtifact(query, results = []) {
  const sources = (results || []).filter(r => r?.url).slice(0, 4).map(r => ({ title: r.title, url: r.url }));
  const summary = (results || []).map(r => r?.snippet || '').filter(Boolean).join(' ').slice(0, 500);
  return { lastQuery: query, summary, sources };
}

let _id = 0;
const newId = () => ++_id;

// â”€â”€ CSS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Waveform bars â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Typing dots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function JarvisAgent({ candidatesSummary = [], onClose, onComplete }) {
  // â”€â”€ Session restore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const candidateSignature = candidatesSummary
    .map(c => `${c.id}:${c.name || ''}`)
    .sort()
    .join('|');

  const savedSession = (() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!saved || saved.signature !== candidateSignature) return null;
      return saved;
    } catch {
      return null;
    }
  })();

  const [messages,     setMessages]     = useState(savedSession?.messages     || []);
  const [context,      setContext]      = useState(normalizeSavedContext(savedSession?.context));
  const [isProcessing, setIsProcessing] = useState(false);
  const [orbMode,      setOrbMode]      = useState('idle');
  const [status,       setStatus]       = useState(savedSession?.status       || '');
  const [textInput,    setTextInput]    = useState('');
  const [hint,         setHint]         = useState('');
  // Show full ATS results inline (no navigation away)
  const [resultsData,  setResultsData]  = useState(null);
  // Full-screen expanded card modal
  const [expandedCard, setExpandedCard] = useState(null);

  const hasGreetedRef  = useRef(!!savedSession);   // skip greeting if restoring
  const msgIndexRef    = useRef(0);
  const messagesEndRef = useRef(null);
  const messagesRef    = useRef(messages);
  const contextRef     = useRef(context);
  const processingRef  = useRef(false);
  const interruptedRef = useRef(false);
  const voiceRef       = useRef(null);
  const listenAfterRef = useRef(null);   // timeout for auto-listen after TTS
  const autoListenEnabledRef = useRef(HANDS_FREE_DEFAULT);
  const chainDepthRef  = useRef(0);      // guard against actionâ†’resultâ†’action loops

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { processingRef.current = isProcessing; }, [isProcessing]);

  // â”€â”€ Persist session to storage on every change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ signature: candidateSignature, messages, context, status }));
    } catch {}
  }, [candidateSignature, messages, context, status]);

  // â”€â”€ Append message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const appendMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: newId(), ...msg }]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  const updateContext = useCallback((patch) => {
    const current = contextRef.current;
    const patchValue = typeof patch === 'function' ? patch(current) : patch;
    const next = mergeJarvisContext(current, patchValue || {});
    contextRef.current = next;
    setContext(next);
    return next;
  }, []);

  const queueAutoListen = useCallback((delay = AUTO_LISTEN_DELAY_MS, nextHint = 'Listeningâ€¦') => {
    if (!autoListenEnabledRef.current) return;
    if (listenAfterRef.current) clearTimeout(listenAfterRef.current);
    listenAfterRef.current = setTimeout(() => {
      const v = voiceRef.current;
      if (!autoListenEnabledRef.current || !v) return;
      if (processingRef.current || v.isRecording || v.isTranscribing || v.speakingMsgIndex !== null) return;
      v.startRecording();
      setHint(nextHint);
    }, delay);
  }, []);

  // â”€â”€ Voice callbacks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Transcription received â€” quality-filter, then send
  const handleTranscribed = useCallback((text) => {
    setHint('');
    if (!isUsableTranscription(text)) {
      // Silently discard garbage (background noise, non-Latin script)
      console.warn('Jarvis: discarded low-quality transcription:', text);
      queueAutoListen(AUTO_RETRY_DELAY_MS);
      return;
    }
    autoListenEnabledRef.current = true;
    handleSendMessageRef.current?.(text); // eslint-disable-line
  }, [queueAutoListen]);

  // TTS finished â€” auto-start listening (conversational loop)
  const handleSpeakingDone = useCallback(() => {
    setHint('');
    if (!autoListenEnabledRef.current) return;
    queueAutoListen(AUTO_LISTEN_DELAY_MS);
  }, [queueAutoListen]);

  // Silence auto-stopped recording
  const handleAutoStop = useCallback(() => {
    setHint('Processingâ€¦');
  }, []);

  // User spoke while Jarvis was speaking â€” stop TTS, capture their interruption
  const handleBargeIn = useCallback(() => {
    const v = voiceRef.current;
    if (!v) return;
    interruptedRef.current = true;
    v.stopSpeaking();
    setHint('Listeningâ€¦');
    // Short debounce so the mic that TTS was using is fully released
    setTimeout(() => {
      const vv = voiceRef.current;
      if (!vv) return;
      if (vv.isRecording || vv.isTranscribing) return;
      vv.startRecording();
    }, 120);
  }, []);

  // Transcription failed â€” stop the loop, wait for user to speak or type again
  const handleTranscribeFail = useCallback((reason) => {
    setHint('');
    if (reason === 'mic_denied') {
      autoListenEnabledRef.current = false;
      setHint('Mic access denied â€” use the text box below.');
    } else if (reason === 'session_expired') {
      autoListenEnabledRef.current = false;
      const msg = 'Your session has expired. Please log out and log back in to continue.';
      appendMsg({ role: 'assistant', content: msg });
      setHint('Session expired â€” please log in again.');
    } else if (autoListenEnabledRef.current && (reason === 'too_short' || reason === 'no_speech')) {
      queueAutoListen(AUTO_RETRY_DELAY_MS);
    }
  }, [appendMsg, queueAutoListen]);

  const voice = useVoice({
    apiBase: API_BASE,
    onTranscribed:    handleTranscribed,
    onSpeakingDone:   handleSpeakingDone,
    onTranscribeFail: handleTranscribeFail,
    onAutoStop:       handleAutoStop,
    onBargeIn:        handleBargeIn,
  });

  voiceRef.current = voice;   // always current, no stale closure

  // â”€â”€ Orb mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (voice.isRecording)                    setOrbMode('listening');
    else if (voice.isTranscribing)            setOrbMode('thinking');
    else if (isProcessing)                    setOrbMode('thinking');
    else if (voice.speakingMsgIndex !== null) setOrbMode('speaking');
    else                                      setOrbMode('idle');
  }, [voice.isRecording, voice.isTranscribing, voice.speakingMsgIndex, isProcessing]);

  // â”€â”€ Core message sender â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSendMessage = useCallback(async (text) => {
    if (!text?.trim()) return;
    if (processingRef.current) return;

    // If AI is speaking, stop it and note the interruption
    const v = voiceRef.current;
    if (v && v.speakingMsgIndex !== null) {
      interruptedRef.current = true;
      v.stopSpeaking();
    }
    // If recording (manual), stop it
    if (v?.isRecording) v.stopRecording();

    const isSystem = text.startsWith('[');
    if (isSystem) {
      // Cap actionâ†’resultâ†’action chains at 3 hops to prevent runaway loops.
      if (chainDepthRef.current >= 3) {
        console.warn('Jarvis: chain depth cap hit, dropping result feedback');
        chainDepthRef.current = 0;
        return;
      }
      chainDepthRef.current += 1;
    } else {
      chainDepthRef.current = 0;
      appendMsg({ role: 'user', content: text });
    }

    setIsProcessing(true);
    setStatus('THINKING');
    setHint('');

    const currentCtx = contextRef.current;
    const wasInterrupted = interruptedRef.current;
    interruptedRef.current = false;

    const history = messagesRef.current
      .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.content?.startsWith('['))
      .map(m => ({ role: m.role, content: m.content }));

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
            pending_action: currentCtx.pendingAction,
            active_candidate_id: currentCtx.activeCandidateId,
            active_candidate_name: currentCtx.activeCandidateName,
            artifacts: currentCtx.artifacts,
            interrupted: wasInterrupted,
          },
        }),
      });

      if (res.status === 401) {
        const msg = 'Your session has expired. Please log out and log back in.';
        appendMsg({ role: 'assistant', content: msg });
        setIsProcessing(false);
        setStatus('SESSION EXPIRED');
        setHint('Session expired â€” please log in again.');
        return;
      }
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const { reply, action, action_params, awaiting_confirmation, updated_context } = data;

      appendMsg({ role: 'assistant', content: reply });

      // Track pending action for confirmation loop prevention
      if (awaiting_confirmation && action) {
        updateContext({
          ...updated_context,
          pendingAction: { action, params: action_params },
        });
      } else {
        updateContext({
          ...updated_context,
          pendingAction: null,
        });
      }

      setIsProcessing(false);
      const latestCtx = contextRef.current;
      setStatus(
        latestCtx.shortlistedIds.length > 0
          ? `${latestCtx.shortlistedIds.length} SHORTLISTED`
          : candidatesSummary.length > 0
            ? `${candidatesSummary.length} CANDIDATE${candidatesSummary.length !== 1 ? 'S' : ''} READY`
            : 'READY'
      );

      // Speak the reply first, then run the action. Awaiting TTS prevents
      // the card (or the chained follow-up API call) from cutting off speech.
      await voiceRef.current?.speakText(reply, msgIndexRef.current++);

      // If the reply looks like a conversation close-out ("you're welcome",
      // "have a good day"), auto-close the panel.
      if (shouldCloseChat(reply)) {
        setTimeout(() => { onClose?.(); }, 400);
        return;
      }

      if (action && !awaiting_confirmation) {
        await executeAction(action, action_params || {}); // eslint-disable-line no-use-before-define
      }

    } catch (err) {
      console.error('Jarvis:', err);
      const msg = `Something went wrong â€” ${err.message}.`;
      appendMsg({ role: 'assistant', content: msg });
      voiceRef.current?.speakText(msg, msgIndexRef.current++);
      setIsProcessing(false);
      setStatus('ERROR');
      chainDepthRef.current = 0;
      interruptedRef.current = false;
    }
  }, [candidatesSummary, appendMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable ref so callbacks can call handleSendMessage without circular deps
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; }, [handleSendMessage]);

  const getCandidateMeta = useCallback((candidateId) => (
    candidatesSummary.find(c => Number(c.id) === Number(candidateId))
  ), [candidatesSummary]);

  const getKnownEmail = useCallback((candidateId) => {
    const ctx = contextRef.current;
    const key = String(candidateId);
    return (
      getCandidateMeta(candidateId)?.email ||
      ctx.artifacts?.scans?.[key]?.contact?.email ||
      ctx.artifacts?.interviews?.[key]?.candidateEmail ||
      ctx.artifacts?.interviewReports?.[key]?.candidateEmail ||
      ctx.artifacts?.credibility?.[key]?.candidateEmail ||
      ''
    );
  }, [getCandidateMeta]);

  const focusCandidate = useCallback((candidateId, fallbackName = '') => {
    const candidate = getCandidateMeta(candidateId);
    const name = candidate?.name || fallbackName || contextRef.current.activeCandidateName || 'Candidate';
    updateContext({
      activeCandidateId: candidateId ?? contextRef.current.activeCandidateId,
      activeCandidateName: name,
    });
    return { id: candidateId, name, candidate };
  }, [getCandidateMeta, updateContext]);

  const cacheCandidateArtifact = useCallback((bucket, candidateId, payload) => {
    if (candidateId == null) return;
    updateContext({
      artifacts: {
        [bucket]: {
          [String(candidateId)]: payload,
        },
      },
    });
  }, [updateContext]);

  // â”€â”€ Action executor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // IMPORTANT: batch_action and list_candidates do NOT recurse back into
  // handleSendMessage â€” that was causing the infinite "want me to send?" loop.
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

    // Helper: check for 401 and show session-expired message
    const handle401 = (res) => {
      if (res.status === 401) {
        setStatus('SESSION EXPIRED');
        setHint('Session expired â€” please log in again.');
        directSay('Your session has expired. Please log out and log back in to continue.');
        return true;
      }
      return false;
    };

    if (action === 'run_ats') {
      // ATS DOES recurse so Jarvis can summarize results conversationally
      setStatus('RUNNING ATSâ€¦');
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
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Pipeline ${res.status}`);
        const d = await res.json();
        const shortlisted = (d.shortlist || []).map(r => r.candidate_id);
        const firstCandidate = (d.shortlist || [])[0] || (d.results || [])[0] || null;
        updateContext({
          role: params.role || ctx.role,
          lastAtsResults: d,
          shortlistedIds: shortlisted,
          lastAction: 'run_ats',
          activeCandidateId: firstCandidate?.candidate_id || null,
          activeCandidateName: firstCandidate?.name || null,
        });
        appendMsg({ role: 'action', content: `Screened ${d.total_screened} candidates`, actionData: d });
        setStatus(`${shortlisted.length} SHORTLISTED`);
        // Send result summary to Jarvis so it can narrate the top candidates
        await handleSendMessageRef.current(`[ATS_RESULT] ${buildAtsSummary(d)}`);
      } catch (err) {
        appendMsg({ role: 'action', content: `ATS failed: ${err.message}` });
        setStatus('ERROR');
      }

    } else if (action === 'batch_action') {
      setStatus('CREATING INTERVIEWSâ€¦');
      try {
        const batchBody = {
          candidate_ids: params.candidate_ids || ctx.shortlistedIds,
          role: params.role || ctx.role || 'Engineer',
          level: params.level || 'Mid-Level',
          num_questions: params.num_questions || 8,
          email_type: params.email_type || 'interview',
          send_emails: params.send_emails || false,
        };
        const res = await fetch(`${API_BASE}/api/pipeline/batch-action`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify(batchBody),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Batch ${res.status}`);
        const d = await res.json();
        const sent = d.emails_sent || 0;
        const created = d.interviews_created || 0;
        const outcomes = d.outcomes || [];
        const firstOutcome = outcomes[0] || {};
        updateContext({
          lastAction: 'batch_action',
          pendingAction: null,
          ...(firstOutcome.candidate_id ? { activeCandidateId: firstOutcome.candidate_id } : {}),
          ...(firstOutcome.name ? { activeCandidateName: firstOutcome.name } : {}),
        });

        outcomes.forEach((outcome) => {
          if (outcome?.candidate_id && outcome?.email) {
            cacheCandidateArtifact('interviews', outcome.candidate_id, {
              candidateEmail: outcome.email,
              role: batchBody.role,
              level: batchBody.level,
              numQuestions: batchBody.num_questions,
              focusAreas: batchBody.focus_areas || [],
              status: outcome.interview_created ? 'created' : 'failed',
              interviewId: outcome.interview_id || null,
            });
          }
        });

        if (params.send_emails) {
          // â”€â”€ Send mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          appendMsg({
            role: 'action',
            content: `${created} interview${created !== 1 ? 's' : ''} created Â· ${sent} email${sent !== 1 ? 's' : ''} sent`,
          });
          setStatus(sent > 0 ? 'EMAILS SENT' : 'DONE');
          if (sent > 0) {
            directSay(`Done! Sent ${sent} interview invitation${sent !== 1 ? 's' : ''}. You're all set!`);
          } else {
            directSay(`Interview created, but email couldn't be sent â€” check your email settings.`);
          }
        } else {
          // â”€â”€ Draft mode â€” show email card with inline Send button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          const first = outcomes[0] || {};
          const emailSubject = first.email_subject || `Interview Invitation â€” ${batchBody.role}`;
          const emailBody    = first.email_body    || '';
          const toNames      = outcomes.map(o => o.name || '?').join(', ');
          // Store params needed for the Send button (send_emails excluded â€” added when clicked)
          const storedParams = { ...batchBody, send_emails: undefined };
          delete storedParams.send_emails;

          appendMsg({
            role: 'action',
            content: 'Email draft ready',
            emailDraftData: { subject: emailSubject, body: emailBody, to: toNames, count: outcomes.length },
            batchParams: storedParams,
          });
          setStatus('EMAIL DRAFTED');
          directSay(`Interview set up for ${toNames}. Here's the email draft â€” review it and hit Send when you're ready.`);
        }
      } catch (err) {
        appendMsg({ role: 'action', content: `Batch failed: ${err.message}` });
        setStatus('ERROR');
        directSay(`Something went wrong creating the interview â€” ${err.message}.`);
      }

    } else if (action === 'list_candidates') {
      const list = buildCandidateList(candidatesSummary);
      directSay(`Here's who you've uploaded: ${list}`);

    } else if (action === 'show_results') {
      const ctx2 = contextRef.current;
      if (ctx2.lastAtsResults) setResultsData(ctx2.lastAtsResults);
      else directSay("No results yet â€” tell me the role and I'll screen the candidates.");

    // â”€â”€ Research / Intelligence actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    } else if (action === 'research_web') {
      setStatus('SEARCHINGâ€¦');
      try {
        const candidateName = params.candidate_name || ctx.activeCandidateName || null;
        const res = await fetch(`${API_BASE}/api/chat/web-search`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            query: params.query || '',
            candidate_id: ctx.activeCandidateId || null,
            candidate_name: candidateName,
          }),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Search ${res.status}`);
        const d = await res.json();
        const results = d.results || [];
        const artifact = buildResearchArtifact(params.query, results);
        const snippet = artifact.summary || 'No useful results came back.';
        const sources = (artifact.sources || []).slice(0, 3).map(s => s.title).join(', ');

        updateContext({
          lastAction: 'research_web',
          artifacts: { research: artifact },
        });

        appendMsg({
          role: 'action',
          content: `Web search: "${params.query}"`,
          searchData: { query: params.query, sources: artifact.sources || [], snippet: snippet.slice(0, 260) },
        });
        setStatus(candidatesSummary.length > 0 ? `${candidatesSummary.length} CANDIDATES READY` : 'READY');
        await handleSendMessageRef.current(
          `[RESEARCH_RESULT] Query: "${params.query}". ${snippet}${sources ? ` Sources: ${sources}.` : ''}`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`Couldn't complete the search â€” ${err.message}.`);
      }

    } else if (action === 'analyze_github') {
      setStatus('SCANNING GITHUBâ€¦');
      try {
        focusCandidate(params.candidate_id, params.candidate_name);
        const candidateMeta = getCandidateMeta(params.candidate_id);
        const githubUrl = candidateMeta?.github_url || '';
        const res = await fetch(`${API_BASE}/api/chat/github-analyze`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ candidate_id: params.candidate_id, github_url: githubUrl || undefined }),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        const d = await res.json();

        if (d.error) {
          directSay(`Couldn't find a GitHub profile for ${params.candidate_name || 'this candidate'} â€” ${d.error}`);
          setStatus('DONE');
          return;
        }

        const profile = d.profile || {};
        const analysis = profile.ai_analysis || '';
        const name = profile.name || params.candidate_name || 'Candidate';
        const repos = profile.public_repos ?? '?';
        const stars = (profile.top_repos || []).reduce((s, r) => s + (r.stars || r.stargazers_count || 0), 0);
        const langsDict = profile.languages || {};
        const langs = Object.keys(langsDict).slice(0, 4).join(', ') || 'N/A';
        const topRepos = (profile.top_repos || []).slice(0, 4);
        const repoNames = topRepos.map(r => r.name).join(', ');

        cacheCandidateArtifact('github', params.candidate_id, {
          name,
          summary: stripMarkdown(analysis).slice(0, 320),
          topProjects: topRepos.map(r => r.name).filter(Boolean).slice(0, 4),
          languages: Object.keys(langsDict).slice(0, 4),
          profile,
        });
        updateContext({ lastAction: 'analyze_github' });

        appendMsg({
          role: 'action',
          content: `GitHub: ${name}`,
          githubData: { name, repos, stars, langs, analysis, topRepos, profile },
        });
        setStatus('DONE');
        await handleSendMessageRef.current(
          `[GITHUB_RESULT] ${name}: ${repos} repos, languages: ${langs}, top projects: ${repoNames || 'N/A'}. ${analysis.slice(0, 300)}`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`GitHub analysis failed â€” ${err.message}.`);
      }

    } else if (action === 'deep_evaluate') {
      setStatus('EVALUATINGâ€¦');
      try {
        focusCandidate(params.candidate_id, params.candidate_name);
        const res = await fetch(`${API_BASE}/api/chat/hiring-agent`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            candidate_id: params.candidate_id,
            role: params.role || ctx.role || 'Engineer',
          }),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Eval ${res.status}`);
        const d = await res.json();
        if (d.error) throw new Error(d.error);

        const report = d.report || d.output || '';
        const artifact = buildEvaluationArtifact(report, params.role || ctx.role || '');
        cacheCandidateArtifact('evaluations', params.candidate_id, artifact);
        updateContext({ lastAction: 'deep_evaluate' });
        appendMsg({
          role: 'action',
          content: `Deep evaluation complete`,
          evalData: { report },   // full report â€” no truncation
        });
        setStatus('DONE');
        // Send full report so Jarvis can read Growth Areas and score accurately
        await handleSendMessageRef.current(
          `[EVAL_RESULT] ${report}`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`Evaluation failed â€” ${err.message}.`);
      }

    } else if (action === 'scan_candidate') {
      setStatus('SCANNING PROFILEâ€¦');
      try {
        focusCandidate(params.candidate_id, params.candidate_name);
        const res = await fetch(`${API_BASE}/api/chat/scan-resume`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ candidate_id: params.candidate_id }),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Scan ${res.status}`);
        const d = await res.json();

        if (d.error) {
          directSay(`Couldn't scan ${params.candidate_name || 'this candidate'} â€” ${d.error}`);
          setStatus('DONE');
          return;
        }

        const profiles = d.profiles || {};
        const gh = profiles.github;
        const li = profiles.linkedin;
        const contact = d.contact || {};
        const summary = d.ai_summary || '';

        const parts = [];
        if (gh?.username) parts.push(`GitHub: github.com/${gh.username}`);
        if (li?.profile_url || li?.headline) parts.push(`LinkedIn: ${li?.headline || li?.profile_url || 'found'}`);
        if (contact?.email) parts.push(`Email: ${contact.email}`);
        if (contact?.phone) parts.push(`Phone: ${contact.phone}`);

        cacheCandidateArtifact('scans', params.candidate_id, {
          summary: summary.slice(0, 320),
          contact,
          githubUsername: gh?.username || '',
          linkedinHeadline: li?.headline || li?.profile_url || '',
          profiles,
        });
        updateContext({ lastAction: 'scan_candidate' });

        appendMsg({
          role: 'action',
          content: `Profile scan: ${params.candidate_name || 'Candidate'}`,
          scanData: { profiles, contact, summary },
        });
        setStatus('DONE');
        const resultText = parts.length
          ? parts.join(' | ')
          : (summary.slice(0, 300) || 'No public profiles found');
        await handleSendMessageRef.current(
          `[SCAN_RESULT] ${params.candidate_name || 'Candidate'}: ${resultText}. ${summary.slice(0, 200)}`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`Profile scan failed â€” ${err.message}.`);
      }

    } else if (action === 'resume_intelligence') {
      setStatus('ANALYZING RESUMEâ€¦');
      try {
        focusCandidate(params.candidate_id, params.candidate_name);
        const res = await fetch(`${API_BASE}/api/chat/resume-intelligence`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ candidate_id: params.candidate_id }),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Resume intel ${res.status}`);
        const d = await res.json();
        const intel = d.intelligence;
        const artifact = buildResumeIntelArtifact(intel);
        cacheCandidateArtifact('resumeIntel', params.candidate_id, artifact);
        updateContext({ lastAction: 'resume_intelligence' });
        appendMsg({
          role: 'action',
          content: 'Resume intelligence ready',
          resumeIntelData: { intelligence: intel, candidateName: params.candidate_name || contextRef.current.activeCandidateName || 'Candidate' },
        });
        setStatus('DONE');
        await handleSendMessageRef.current(
          `[RESUME_INTEL_RESULT] ${params.candidate_name || 'Candidate'}: confidence ${artifact.confidence}. Gaps: ${(artifact.gaps || []).join('; ') || 'none called out'}. Red flags: ${(artifact.redFlags || []).join('; ') || 'none'}. Verification targets: ${(artifact.verificationTargets || []).join(', ') || 'none'}.`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`Resume analysis failed â€” ${err.message}.`);
      }

    } else if (action === 'create_interview') {
      setStatus('CREATING INTERVIEWâ€¦');
      try {
        focusCandidate(params.candidate_id, params.candidate_name);
        const candidateEmail = params.candidate_email || getKnownEmail(params.candidate_id);
        if (!candidateEmail) {
          directSay(`I need the candidate's email before I can create the interview. Ask me to scan their profile first.`);
          setStatus('DONE');
          return;
        }

        const candidateMeta = getCandidateMeta(params.candidate_id);
        const body = {
          candidate_id: params.candidate_id,
          candidate_email: candidateEmail,
          candidate_name: params.candidate_name || candidateMeta?.name || 'Candidate',
          role: params.role || ctx.role || candidateMeta?.predicted_role || 'General',
          level: params.level || candidateMeta?.experience_level || 'Mid-Level',
          num_questions: params.num_questions || 8,
          focus_areas: params.focus_areas || [],
        };
        const res = await fetch(`${API_BASE}/api/chat/create-interview`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify(body),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Create interview ${res.status}`);
        const d = await res.json();
        const interviewConfig = d.interview_config || body;
        cacheCandidateArtifact('interviews', params.candidate_id, buildInterviewArtifact(interviewConfig, candidateEmail));
        updateContext({ lastAction: 'create_interview' });
        appendMsg({
          role: 'action',
          content: `Interview created for ${body.candidate_name}`,
          interviewData: { candidateName: body.candidate_name, candidateEmail, config: interviewConfig },
        });
        setStatus('DONE');
        await handleSendMessageRef.current(
          `[INTERVIEW_CREATED_RESULT] Created an interview for ${body.candidate_name} at ${candidateEmail}. Role: ${interviewConfig.role || body.role}. ${interviewConfig.num_questions || body.num_questions} questions. Focus: ${(interviewConfig.focus_areas || body.focus_areas || []).join(', ') || 'general skills'}.`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`I couldn't create the interview â€” ${err.message}.`);
      }

    } else if (action === 'get_interview_report') {
      setStatus('FETCHING REPORTâ€¦');
      try {
        focusCandidate(params.candidate_id, params.candidate_name);
        const candidateEmail = params.candidate_email || getKnownEmail(params.candidate_id);
        if (!candidateEmail) {
          directSay(`I don't have an email for that candidate yet, so I can't fetch the interview report.`);
          setStatus('DONE');
          return;
        }
        const res = await fetch(`${API_BASE}/api/chat/get-interview-results/${encodeURIComponent(candidateEmail)}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Interview report ${res.status}`);
        const d = await res.json();
        const report = d.results?.[0]?.report;
        if (!report) {
          directSay(`There isn't a completed interview report for ${params.candidate_name || 'this candidate'} yet.`);
          setStatus('DONE');
          return;
        }
        const artifact = buildInterviewReportArtifact(report, candidateEmail);
        cacheCandidateArtifact('interviewReports', params.candidate_id, artifact);
        updateContext({ lastAction: 'get_interview_report' });
        appendMsg({
          role: 'action',
          content: `Interview report: ${params.candidate_name || 'Candidate'}`,
          reportData: { candidateName: params.candidate_name || 'Candidate', candidateEmail, report },
        });
        setStatus('DONE');
        await handleSendMessageRef.current(
          `[INTERVIEW_REPORT_RESULT] ${params.candidate_name || 'Candidate'} scored ${artifact.avgScore ?? 'N/A'} on average. Eye contact ${artifact.eyeContact} percent. Violations ${artifact.violations}. ${artifact.summary || ''}`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`I couldn't fetch the interview report â€” ${err.message}.`);
      }

    } else if (action === 'credibility_analysis') {
      setStatus('CHECKING CREDIBILITYâ€¦');
      try {
        focusCandidate(params.candidate_id, params.candidate_name);
        const candidateEmail = params.candidate_email || getKnownEmail(params.candidate_id);
        if (!candidateEmail) {
          directSay(`I need the candidate's email before I can run credibility analysis.`);
          setStatus('DONE');
          return;
        }
        const res = await fetch(`${API_BASE}/api/chat/credibility-analysis`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ candidate_id: params.candidate_id, candidate_email: candidateEmail }),
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Credibility ${res.status}`);
        const d = await res.json();
        const credibility = d.credibility;
        const artifact = buildCredibilityArtifact(credibility, candidateEmail);
        cacheCandidateArtifact('credibility', params.candidate_id, artifact);
        updateContext({ lastAction: 'credibility_analysis' });
        appendMsg({
          role: 'action',
          content: `Credibility analysis: ${params.candidate_name || 'Candidate'}`,
          credibilityData: { candidateName: params.candidate_name || 'Candidate', candidateEmail, credibility },
        });
        setStatus('DONE');
        await handleSendMessageRef.current(
          `[CREDIBILITY_RESULT] ${params.candidate_name || 'Candidate'} scored ${artifact.credibilityScore} out of 100 for credibility. Recommendation: ${artifact.recommendation || 'not provided'}. Key insights: ${(artifact.keyInsights || []).join('; ') || 'none'}.`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`Credibility analysis failed â€” ${err.message}.`);
      }

    } else if (action === 'export_report') {
      const candidateEmail = params.candidate_email || getKnownEmail(params.candidate_id);
      if (!candidateEmail) {
        directSay(`I don't have the candidate email, so I can't export the PDF yet.`);
        setStatus('DONE');
        return;
      }
      const url = `${API_BASE}/api/chat/export-report/${encodeURIComponent(candidateEmail)}`;
      window.open(url, '_blank');
      appendMsg({
        role: 'action',
        content: `Opened PDF report for ${params.candidate_name || 'Candidate'}`,
        exportData: { url, candidateName: params.candidate_name || 'Candidate' },
      });
      updateContext({ lastAction: 'export_report' });
      setStatus('DONE');
      directSay(`I opened the PDF report for ${params.candidate_name || 'that candidate'}.`);

    } else if (action === 'get_calendly') {
      setStatus('FETCHING CALENDLYâ€¦');
      try {
        const res = await fetch(`${API_BASE}/api/chat/calendly-link`, {
          method: 'GET', headers: hdrs,
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error(`Calendly ${res.status}`);
        const d = await res.json();

        if (d.error) {
          directSay(`Calendly isn't connected yet â€” ${d.error}. You can set it up in your account settings.`);
          setStatus('DONE');
          return;
        }

        const url = d.scheduling_url || '';
        const eventTypes = (d.event_types || []).map(e => e.name).slice(0, 3).join(', ');

        appendMsg({
          role: 'action',
          content: 'Calendly link',
          calendlyData: { url, eventTypes },
        });
        setStatus('DONE');
        await handleSendMessageRef.current(
          `[CALENDLY_RESULT] Scheduling URL: ${url}. Available event types: ${eventTypes || 'standard meeting'}.`
        );
      } catch (err) {
        setStatus('ERROR');
        directSay(`Couldn't fetch Calendly â€” ${err.message}.`);
      }
    }
  }, [appendMsg, cacheCandidateArtifact, candidatesSummary, focusCandidate, getCandidateMeta, getKnownEmail, updateContext]);

  // â”€â”€ Greeting (once) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const n = candidatesSummary.length;
    const greeting = n > 0
      ? `Hey, I'm Jarvis. I can see ${n} resume${n !== 1 ? 's' : ''} loaded. What role are you hiring for?`
      : "Hey, I'm Jarvis. No resumes uploaded yet â€” head back, add some, then come talk to me.";

    setStatus(n > 0 ? `${n} CANDIDATE${n !== 1 ? 'S' : ''} READY` : 'NO CANDIDATES');
    autoListenEnabledRef.current = HANDS_FREE_DEFAULT;

    setTimeout(() => {
      appendMsg({ role: 'assistant', content: greeting });
      voiceRef.current?.speakText(greeting, msgIndexRef.current++);
    }, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // â”€â”€ Mic button â€” interrupt speaking or toggle recording â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleMicClick = useCallback(() => {
    const v = voiceRef.current;
    if (!v) return;

    // Interrupt AI speech
    if (v.speakingMsgIndex !== null) {
      interruptedRef.current = true;
      v.stopSpeaking();
      autoListenEnabledRef.current = true;
      queueAutoListen(120, 'Listeningâ€¦');
      return;
    }

    // Toggle manual recording
    if (v.isRecording) {
      autoListenEnabledRef.current = false;
      v.stopRecording();
      if (listenAfterRef.current) clearTimeout(listenAfterRef.current);
      setHint('Hands-free paused');
    } else {
      if (processingRef.current) return;
      autoListenEnabledRef.current = true;
      v.startRecording();
      setHint('Listeningâ€¦');
    }
  }, [queueAutoListen]);

  // â”€â”€ Orb click â€” same as mic (interrupt or start) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleOrbClick = useCallback(() => {
    handleMicClick();
  }, [handleMicClick]);

  // â”€â”€ Text input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && textInput.trim() && !isProcessing) {
      e.preventDefault();
      const t = textInput.trim();
      autoListenEnabledRef.current = HANDS_FREE_DEFAULT;
      setTextInput('');
      handleSendMessage(t);
    }
  };

  const handleSendClick = () => {
    const t = textInput.trim();
    if (!t || isProcessing) return;
    autoListenEnabledRef.current = HANDS_FREE_DEFAULT;
    setTextInput('');
    handleSendMessage(t);
  };

  // â”€â”€ Cleanup on unmount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    return () => {
      autoListenEnabledRef.current = false;
      if (listenAfterRef.current) clearTimeout(listenAfterRef.current);
      voiceRef.current?.stopSpeaking();
      voiceRef.current?.stopRecording();
    };
  }, []);

  // â”€â”€ New chat â€” clear everything and re-greet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleNewChat = useCallback(() => {
    // Stop any active audio/recording/timers
    if (listenAfterRef.current) clearTimeout(listenAfterRef.current);
    voiceRef.current?.stopSpeaking();
    voiceRef.current?.stopRecording();

    // Clear persisted session
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}

    // Reset all state
    setMessages([]);
    const freshContext = createDefaultJarvisContext();
    contextRef.current = freshContext;
    setContext(freshContext);
    setIsProcessing(false);
    setOrbMode('idle');
    setTextInput('');
    setHint('');
    setResultsData(null);
    autoListenEnabledRef.current = HANDS_FREE_DEFAULT;

    // Allow greeting to fire again
    hasGreetedRef.current = false;
    msgIndexRef.current = 0;
    interruptedRef.current = false;

    // Trigger greeting on next tick (after state flush)
    setTimeout(() => {
      const n = candidatesSummary.length;
      const greeting = n > 0
        ? `Hey, I'm Jarvis. I can see ${n} resume${n !== 1 ? 's' : ''} loaded. What role are you hiring for?`
        : "Hey, I'm Jarvis. No resumes uploaded yet â€” head back, add some, then come talk to me.";
      setStatus(n > 0 ? `${n} CANDIDATE${n !== 1 ? 'S' : ''} READY` : 'NO CANDIDATES');
      autoListenEnabledRef.current = HANDS_FREE_DEFAULT;
      appendMsg({ role: 'assistant', content: greeting });
      voiceRef.current?.speakText(greeting, msgIndexRef.current++);
      hasGreetedRef.current = true;
    }, 100);
  }, [candidatesSummary, appendMsg]);

  // â”€â”€ Show ATS results inline (no navigation away) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Expanded card modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const expandBtn = (msg) => (
    <button
      onClick={() => setExpandedCard(msg)}
      title="Expand"
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
        color: '#52525B', display: 'flex', alignItems: 'center',
        transition: 'color 0.15s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#A1A1AA'; }}
      onMouseLeave={e => { e.currentTarget.style.color = '#52525B'; }}
    >
      <Maximize2 size={12} />
    </button>
  );

  // â”€â”€ Orb animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <>
      <style>{CSS}</style>

      {/* â”€â”€ Full-screen card detail modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {expandedCard && (() => {
        const g  = expandedCard.githubData;
        const ev = expandedCard.evalData;
        const s  = expandedCard.searchData;
        const em = expandedCard.emailDraftData;
        const sc = expandedCard.scanData;
        const ri = expandedCard.resumeIntelData;
        const iv = expandedCard.interviewData;
        const rp = expandedCard.reportData;
        const cr = expandedCard.credibilityData;
        const ex = expandedCard.exportData;
        return (
          <div
            onClick={() => setExpandedCard(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 3500,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#0F0F17',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 18, width: '100%', maxWidth: 680,
                maxHeight: '85vh', overflowY: 'auto',
                padding: '28px 32px',
                fontFamily: "'DM Sans', -apple-system, sans-serif",
              }}
            >
              {/* Close */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <button
                  onClick={() => setExpandedCard(null)}
                  style={{ background: 'none', border: 'none', color: '#52525B', cursor: 'pointer', padding: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#52525B'; }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* â”€â”€ GitHub expanded â”€â”€ */}
              {g && (() => {
                const profile = g.profile || {};
                const allLangs = Object.entries(profile.languages || {});
                const allRepos = profile.top_repos || [];
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(245,158,11,0.5)', marginBottom: 6 }}>GITHUB PROFILE</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#E4E4E7', marginBottom: 4 }}>{g.name}</div>
                    {profile.login && <div style={{ fontSize: 13, color: '#52525B', marginBottom: 16 }}>@{profile.login} Â· Member since {profile.created_at || '?'}</div>}
                    <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                      {[['Public Repos', g.repos], ['Total Stars', g.stars], ['Followers', profile.followers ?? '?'], ['Following', profile.following ?? '?']].map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{l.toUpperCase()}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#E4E4E7' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {profile.location && <div style={{ fontSize: 13, color: '#71717A', marginBottom: 4 }}>ðŸ“ {profile.location}</div>}
                    {profile.company  && <div style={{ fontSize: 13, color: '#71717A', marginBottom: 4 }}>ðŸ¢ {profile.company}</div>}
                    {profile.blog     && <div style={{ fontSize: 13, color: '#71717A', marginBottom: 16 }}>ðŸ”— {profile.blog}</div>}
                    {allLangs.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>LANGUAGES</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {allLangs.map(([lang, count]) => (
                            <span key={lang} style={{ fontSize: 12, fontWeight: 600, color: '#D97706', background: 'rgba(217,119,6,0.1)', padding: '3px 10px', borderRadius: 100 }}>
                              {lang} ({count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {allRepos.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>ALL PROJECTS</div>
                        {allRepos.map((r, i) => (
                          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#E4E4E7' }}>{r.name}</span>
                              {r.language && <span style={{ fontSize: 10, color: '#D97706', background: 'rgba(217,119,6,0.1)', padding: '1px 7px', borderRadius: 100 }}>{r.language}</span>}
                              <span style={{ fontSize: 11, color: '#52525B', marginLeft: 'auto' }}>â­ {r.stars || 0}  ðŸ´ {r.forks || 0}</span>
                            </div>
                            {r.description && <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>{r.description}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {g.analysis && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>AI ANALYSIS</div>
                        <p style={{ margin: 0, fontSize: 13, color: '#A1A1AA', lineHeight: 1.7 }}>{g.analysis}</p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* â”€â”€ Evaluation expanded â”€â”€ */}
              {ev && (() => {
                const rpt = ev.report || '';
                const scoreMatch = rpt.match(/(?:overall\s+fit\s+score|fit\s+score|overall\s+score)[^:]*?:\s*(\d+)/i);
                const score = scoreMatch ? scoreMatch[1] : null;
                const verdictMatch = rpt.match(/recommendation[^:]*?:\s*([^\n]{3,50})/i);
                const verdict = verdictMatch ? stripMarkdown(verdictMatch[1].trim()).split('\n')[0] : null;
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(248,113,113,0.5)', marginBottom: 6 }}>EVALUATION REPORT</div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                      {score   && <span style={{ fontSize: 22, fontWeight: 900, color: '#4ADE80' }}>{score}<span style={{ fontSize: 13, color: '#52525B' }}>/100</span></span>}
                      {verdict && <span style={{ fontSize: 13, fontWeight: 700, color: '#FCD34D', background: 'rgba(252,211,77,0.1)', padding: '4px 14px', borderRadius: 100, alignSelf: 'center' }}>{verdict}</span>}
                    </div>
                    <div>{renderMarkdown(rpt)}</div>
                  </>
                );
              })()}

              {/* â”€â”€ Web search expanded â”€â”€ */}
              {s && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(56,189,248,0.5)', marginBottom: 6 }}>WEB SEARCH RESULTS</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#E4E4E7', marginBottom: 16 }}>"{s.query}"</div>
                  <div style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.75, marginBottom: 20, whiteSpace: 'pre-wrap' }}>{s.snippet}</div>
                  {(s.sources || []).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>SOURCES</div>
                      {s.sources.map((src, i) => (
                        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#60A5FA', marginBottom: 2 }}>{src.title}</div>
                          {src.url && <div style={{ fontSize: 11, color: '#52525B', wordBreak: 'break-all' }}>{src.url}</div>}
                          {src.content && <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5, marginTop: 4 }}>{src.content.slice(0, 300)}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* â”€â”€ Email draft expanded â”€â”€ */}
              {em && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(245,158,11,0.5)', marginBottom: 6 }}>EMAIL DRAFT</div>
                  <div style={{ fontSize: 13, color: '#52525B', marginBottom: 4 }}>To: {em.to}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#E4E4E7', marginBottom: 16 }}>{em.subject}</div>
                  <div style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.8, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '16px 18px', whiteSpace: 'pre-wrap', marginBottom: 20 }}>{em.body}</div>
                  <button
                    onClick={() => { setExpandedCard(null); executeAction('batch_action', { ...expandedCard.batchParams, send_emails: true }); }}
                    style={{ padding: '10px 24px', borderRadius: 100, background: 'rgba(217,119,6,0.25)', border: '1px solid rgba(245,158,11,0.45)', color: '#FDE68A', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                  >Send Email â†’</button>
                </>
              )}

              {/* â”€â”€ Scan expanded â”€â”€ */}
              {sc && (() => {
                const ghP = sc.profiles?.github;
                const liP = sc.profiles?.linkedin;
                const ct  = sc.contact || {};
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(245,158,11,0.5)', marginBottom: 16 }}>FULL PROFILE SCAN</div>
                    {ghP && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>GITHUB</div>
                        {ghP.username && <div style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 3 }}>@{ghP.username}</div>}
                        {ghP.bio      && <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>{ghP.bio}</div>}
                      </div>
                    )}
                    {liP && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>LINKEDIN</div>
                        {liP.name      && <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E4E7', marginBottom: 3 }}>{liP.name}</div>}
                        {liP.headline  && <div style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 3 }}>{liP.headline}</div>}
                        {liP.about     && <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>{liP.about.slice(0, 400)}</div>}
                      </div>
                    )}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>CONTACT</div>
                      {ct.email && <div style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 3 }}>âœ‰ {ct.email}</div>}
                      {ct.phone && <div style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 3 }}>ðŸ“ž {ct.phone}</div>}
                    </div>
                    {sc.summary && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>AI SUMMARY</div>
                        <p style={{ margin: 0, fontSize: 13, color: '#A1A1AA', lineHeight: 1.7 }}>{sc.summary}</p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Resume intelligence expanded */}
              {ri && (() => {
                const intel = ri.intelligence || {};
                const gaps = intel.gaps || [];
                const targets = intel.verification_targets || [];
                const strengths = intel.strong_points || [];
                const redFlags = intel.red_flags || [];
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(139,92,246,0.55)', marginBottom: 6 }}>RESUME INTELLIGENCE</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#E4E4E7', marginBottom: 6 }}>{ri.candidateName || 'Candidate'}</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: intel.resume_confidence_score >= 70 ? '#4ADE80' : intel.resume_confidence_score >= 50 ? '#F59E0B' : '#F87171', marginBottom: 18 }}>
                      {intel.resume_confidence_score || 0}
                      <span style={{ fontSize: 13, color: '#52525B', marginLeft: 6 }}>resume confidence</span>
                    </div>
                    {gaps.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>GAPS AND INCONSISTENCIES</div>
                        {gaps.map((gap, i) => (
                          <div key={i} style={{ padding: '10px 0', borderBottom: i < gaps.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: gap.severity === 'high' ? '#F87171' : gap.severity === 'medium' ? '#FCD34D' : '#94A3B8', marginBottom: 4 }}>
                              {(gap.type || 'gap').replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <div style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.6 }}>{gap.detail}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {targets.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>VERIFICATION TARGETS</div>
                        {targets.map((target, i) => (
                          <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#E4E4E7', marginBottom: 4 }}>{target.skill || target.claim || `Target ${i + 1}`}</div>
                            {target.claim && <div style={{ fontSize: 12, color: '#A1A1AA', marginBottom: 4 }}>Claim: {target.claim}</div>}
                            {target.question_angle && <div style={{ fontSize: 12, color: '#8B5CF6' }}>{target.question_angle}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {strengths.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>STRONG POINTS</div>
                        {strengths.map((point, i) => (
                          <div key={i} style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.6, padding: '4px 0' }}>{point}</div>
                        ))}
                      </div>
                    )}
                    {redFlags.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>RED FLAGS</div>
                        {redFlags.map((flag, i) => (
                          <div key={i} style={{ fontSize: 13, color: '#F87171', lineHeight: 1.6, padding: '4px 0' }}>{flag}</div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Interview setup expanded */}
              {iv && (() => {
                const config = iv.config || {};
                const intel = config.resume_intelligence || {};
                const focusAreas = config.focus_areas || config.focusAreas || [];
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(59,130,246,0.55)', marginBottom: 6 }}>INTERVIEW CREATED</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#E4E4E7', marginBottom: 4 }}>{iv.candidateName}</div>
                    <div style={{ fontSize: 13, color: '#60A5FA', marginBottom: 18 }}>{iv.candidateEmail}</div>
                    <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                      {[['Role', config.role || 'General'], ['Level', config.level || 'Mid-Level'], ['Questions', config.num_questions || config.numQuestions || 0], ['Status', config.status || 'pending']].map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label.toUpperCase()}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#E4E4E7' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {focusAreas.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>FOCUS AREAS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {focusAreas.map((area, i) => (
                            <span key={i} style={{ fontSize: 12, fontWeight: 600, color: '#60A5FA', background: 'rgba(59,130,246,0.1)', padding: '3px 10px', borderRadius: 100 }}>
                              {area}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {intel && Object.keys(intel).length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>ATTACHED RESUME INTELLIGENCE</div>
                        <div style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.7, marginBottom: 8 }}>
                          Confidence: {intel.resume_confidence_score || 0}. Verification targets: {(intel.verification_targets || []).length}. Red flags: {(intel.red_flags || []).length}.
                        </div>
                        {(intel.verification_targets || []).slice(0, 4).map((target, i) => (
                          <div key={i} style={{ fontSize: 12, color: '#71717A', lineHeight: 1.6, padding: '3px 0' }}>
                            {target.skill || target.claim || `Target ${i + 1}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Interview report expanded */}
              {rp && (() => {
                const report = rp.report || {};
                const scores = Array.isArray(report.scores) ? report.scores : [];
                const textReport = typeof report.report === 'string' ? report.report : '';
                const transcript = Array.isArray(report.transcript) ? report.transcript : [];
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(34,197,94,0.55)', marginBottom: 6 }}>INTERVIEW REPORT</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#E4E4E7', marginBottom: 4 }}>{rp.candidateName}</div>
                    <div style={{ fontSize: 13, color: '#60A5FA', marginBottom: 18 }}>{rp.candidateEmail}</div>
                    <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                      {[['Avg Score', report.avgScore ?? (scores.length ? Number((scores.reduce((sum, item) => sum + (item?.score || 0), 0) / scores.length).toFixed(1)) : 'N/A')], ['Eye Contact', `${report.eyeContact || 0}%`], ['Violations', report.violations || 0], ['Questions', scores.length]].map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label.toUpperCase()}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#E4E4E7' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {scores.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>QUESTION SCORES</div>
                        {scores.map((item, i) => (
                          <div key={i} style={{ padding: '10px 0', borderBottom: i < scores.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#E4E4E7' }}>{item.question || `Question ${i + 1}`}</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: '#4ADE80' }}>{item.score ?? 'N/A'}</div>
                            </div>
                            {item.feedback && <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.6 }}>{item.feedback}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {textReport && (
                      <div style={{ marginBottom: transcript.length > 0 ? 20 : 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>ASSESSMENT SUMMARY</div>
                        <div>{renderMarkdown(textReport)}</div>
                      </div>
                    )}
                    {transcript.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 10 }}>TRANSCRIPT</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {transcript.slice(0, 12).map((turn, i) => (
                            <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: turn.role === 'interviewer' ? 'rgba(59,130,246,0.09)' : 'rgba(255,255,255,0.03)' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 4 }}>
                                {(turn.role || 'speaker').toUpperCase()}
                              </div>
                              <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.6 }}>{turn.text}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Credibility expanded */}
              {cr && (() => {
                const credibility = cr.credibility || {};
                const rvi = credibility.resume_vs_interview || {};
                const levelAssessment = credibility.level_assessment || {};
                const groups = [
                  { label: 'Confirmed Skills', color: '#4ADE80', items: rvi.confirmed_skills || [] },
                  { label: 'Overrated Skills', color: '#F87171', items: rvi.overrated_skills || [] },
                  { label: 'Hidden Strengths', color: '#60A5FA', items: rvi.hidden_strengths || [] },
                  { label: 'Unverified Skills', color: '#A1A1AA', items: rvi.unverified_skills || [] },
                ];
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(139,92,246,0.55)', marginBottom: 6 }}>CREDIBILITY ANALYSIS</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#E4E4E7', marginBottom: 4 }}>{cr.candidateName}</div>
                    <div style={{ fontSize: 13, color: '#60A5FA', marginBottom: 18 }}>{cr.candidateEmail}</div>
                    <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                      {[['Credibility', `${credibility.credibility_score || 0}/100`], ['Recommendation', credibility.hiring_recommendation || 'N/A'], ['Confidence', credibility.confidence_in_assessment || 'N/A']].map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label.toUpperCase()}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#E4E4E7' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {groups.filter(group => group.items.length > 0).map(group => (
                      <div key={group.label} style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>{group.label.toUpperCase()}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {group.items.map((item, i) => (
                            <span key={i} style={{ fontSize: 12, fontWeight: 600, color: group.color, background: `${group.color}15`, padding: '3px 10px', borderRadius: 100 }}>
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(levelAssessment.resume_claims || levelAssessment.interview_suggests || levelAssessment.explanation) && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>LEVEL ASSESSMENT</div>
                        <div style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.7 }}>
                          Resume claims: {levelAssessment.resume_claims || 'N/A'}. Interview suggests: {levelAssessment.interview_suggests || 'N/A'}.
                          {levelAssessment.explanation ? ` ${levelAssessment.explanation}` : ''}
                        </div>
                      </div>
                    )}
                    {(credibility.key_insights || []).length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#52525B', letterSpacing: '0.1em', marginBottom: 8 }}>KEY INSIGHTS</div>
                        {(credibility.key_insights || []).map((insight, i) => (
                          <div key={i} style={{ fontSize: 13, color: '#A1A1AA', lineHeight: 1.6, padding: '4px 0' }}>{insight}</div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Export expanded */}
              {ex && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(59,130,246,0.55)', marginBottom: 6 }}>PDF REPORT</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#E4E4E7', marginBottom: 18 }}>{ex.candidateName}</div>
                  <a
                    href={ex.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '12px 24px', borderRadius: 100, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93C5FD', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open PDF report
                  </a>
                </>
              )}
            </div>
          </div>
        );
      })()}

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

        {/* â”€â”€ ZONE 1: Orb â”€â”€ */}
        <div style={{
          position: 'relative', zIndex: 1, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 44, paddingBottom: 28,
        }}>
          {/* Orb */}
          <div
            onClick={handleOrbClick}
            title={voice.speakingMsgIndex !== null ? 'Interrupt and reply' : voice.isRecording ? 'Pause listening' : 'Resume listening'}
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
                  <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', fontWeight: 200 }}>â—Ž</div>
                ) : (
                  <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.75)', fontWeight: 200 }}>â—ˆ</div>
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

        {/* â”€â”€ ZONE 2: Messages â”€â”€ */}
        <div style={{
          flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1,
          padding: '12px 0 4px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.05) transparent',
        }}>
          <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 20px' }}>

            {messages.map(msg => {
              // â”€â”€ Jarvis message
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
                    {stripMarkdown(msg.content)}
                  </p>
                </div>
              );

              // â”€â”€ User message
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

              // â”€â”€ Action card
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
                          {(d.role || '').toUpperCase()} Â· {d.total_screened || 0} SCREENED
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
                          {/* View full results â€” opens inline, no navigation away */}
                          <button
                            onClick={() => setResultsData(d)}
                            style={{
                              padding: '6px 14px', borderRadius: 100,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.09)',
                              color: '#71717A', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            View full results â†’
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
                // â”€â”€ GitHub card
                if (msg.githubData) {
                  const g = msg.githubData;
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 20 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(245,158,11,0.4)' }}>GITHUB Â· {g.name}</div>
                          {expandBtn(msg)}
                        </div>
                        <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
                          {[{ label: 'REPOS', val: g.repos }, { label: 'STARS', val: g.stars }, { label: 'LANGUAGES', val: g.langs }].map(({ label, val }) => (
                            <div key={label}>
                              <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#E4E4E7', marginTop: 2 }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {g.topRepos?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em', marginBottom: 5 }}>TOP PROJECTS</div>
                            {g.topRepos.slice(0, 3).map((r, i) => (
                              <div key={i} style={{ fontSize: 12, color: '#A1A1AA', marginBottom: 3, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                <span style={{ color: '#E4E4E7', fontWeight: 600 }}>{r.name}</span>
                                {r.language && <span style={{ fontSize: 10, color: '#52525B' }}>{r.language}</span>}
                                {r.description && <span style={{ fontSize: 11, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{r.description}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {g.analysis && (
                          <p style={{ margin: 0, fontSize: 12, color: '#71717A', lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                            {g.analysis.slice(0, 200)}{g.analysis.length > 200 ? 'â€¦' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                // â”€â”€ Email draft card
                if (msg.emailDraftData) {
                  const e = msg.emailDraftData;
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 20 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(245,158,11,0.5)' }}>
                            EMAIL DRAFT Â· TO: {e.to}{e.count > 1 ? ` (+${e.count - 1} more)` : ''}
                          </div>
                          {expandBtn(msg)}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#E4E4E7', marginBottom: 8 }}>{e.subject}</div>
                        {e.body && (
                          <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.65, background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {e.body.slice(0, 400)}{e.body.length > 400 ? 'â€¦' : ''}
                          </div>
                        )}
                        <button
                          onClick={() => executeAction('batch_action', { ...msg.batchParams, send_emails: true })}
                          style={{ padding: '7px 18px', borderRadius: 100, background: 'rgba(217,119,6,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#FDE68A', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e2 => { e2.currentTarget.style.background = 'rgba(217,119,6,0.35)'; }}
                          onMouseLeave={e2 => { e2.currentTarget.style.background = 'rgba(217,119,6,0.2)'; }}
                        >Send Email â†’</button>
                      </div>
                    </div>
                  );
                }

                // â”€â”€ Web search card
                if (msg.searchData) {
                  const s = msg.searchData;
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(56,189,248,0.5)' }}>WEB SEARCH Â· {s.query}</div>
                          {expandBtn(msg)}
                        </div>
                        {s.snippet && <p style={{ margin: '0 0 6px', fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>{s.snippet.slice(0, 160)}â€¦</p>}
                        {(s.sources || []).slice(0, 2).map((src, i) => (
                          <div key={i} style={{ fontSize: 10, color: '#3B82F6', marginTop: 2 }}>Â· {src.title}</div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // â”€â”€ Evaluation / Deep analysis card
                if (msg.evalData) {
                  const ev = msg.evalData;
                  const rpt = ev.report || '';
                  const plain = stripMarkdown(rpt);
                  const scoreMatch = rpt.match(/(?:overall\s+fit\s+score|fit\s+score|overall\s+score)[^:]*?:\s*(\d+)/i);
                  const score = scoreMatch ? scoreMatch[1] : null;
                  const verdictMatch = rpt.match(/recommendation[^:]*?:\s*([^\n]{3,50})/i);
                  const verdict = verdictMatch ? stripMarkdown(verdictMatch[1].trim()).split('\n')[0] : null;
                  // Extract sections by keyword â€” HR agent uses "Growth Areas" for weaknesses
                  const weakText = extractSection(rpt, ['growth', 'area', 'concern', 'weakness', 'drawback', 'improvement', 'gap', 'limitation']);
                  const strengthText = extractSection(rpt, ['strength', 'match']);
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 20 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(248,113,113,0.5)' }}>EVALUATION REPORT</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {score && <span style={{ fontSize: 13, fontWeight: 900, color: '#4ADE80' }}>{score}/100</span>}
                            {verdict && <span style={{ fontSize: 10, fontWeight: 700, color: '#FCD34D', background: 'rgba(252,211,77,0.1)', padding: '2px 8px', borderRadius: 100 }}>{verdict}</span>}
                            {expandBtn(msg)}
                          </div>
                        </div>
                        {strengthText && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, color: '#4ADE80', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>STRENGTHS</div>
                            <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.65 }}>{strengthText.slice(0, 250)}{strengthText.length > 250 ? 'â€¦' : ''}</div>
                          </div>
                        )}
                        {weakText && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, color: '#F87171', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>WEAKNESSES / GAPS</div>
                            <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.65 }}>{weakText.slice(0, 250)}{weakText.length > 250 ? 'â€¦' : ''}</div>
                          </div>
                        )}
                        {!strengthText && !weakText && (
                          <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.65 }}>
                            {plain.slice(0, 320)}{plain.length > 320 ? 'â€¦' : ''}
                          </div>
                        )}
                        <div style={{ marginTop: 8, fontSize: 10, color: '#3F3F46', cursor: 'pointer' }}
                          onClick={() => setExpandedCard(msg)}>
                          Tap â†— for full report
                        </div>
                      </div>
                    </div>
                  );
                }

                // â”€â”€ Scan / LinkedIn card
                if (msg.scanData) {
                  const sc = msg.scanData;
                  const gh = sc.profiles?.github;
                  const li = sc.profiles?.linkedin;
                  const ct = sc.contact || {};
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(245,158,11,0.4)' }}>PROFILE SCAN</div>
                          {expandBtn(msg)}
                        </div>
                        {gh?.username && <div style={{ fontSize: 12, color: '#71717A', marginBottom: 3 }}>GitHub: github.com/{gh.username}</div>}
                        {li?.headline && <div style={{ fontSize: 12, color: '#71717A', marginBottom: 3 }}>LinkedIn: {li.headline}</div>}
                        {ct.email    && <div style={{ fontSize: 12, color: '#71717A', marginBottom: 3 }}>Email: {ct.email}</div>}
                        {ct.phone    && <div style={{ fontSize: 12, color: '#71717A' }}>Phone: {ct.phone}</div>}
                        {sc.summary  && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#52525B', lineHeight: 1.5 }}>{sc.summary.slice(0, 120)}â€¦</p>}
                      </div>
                    </div>
                  );
                }

                // â”€â”€ Calendly card
                if (msg.resumeIntelData) {
                  const ri = msg.resumeIntelData;
                  const intel = ri.intelligence || {};
                  const gaps = intel.gaps || [];
                  const targets = intel.verification_targets || [];
                  const redFlags = intel.red_flags || [];
                  const confidence = intel.resume_confidence_score || 0;
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(139,92,246,0.55)' }}>
                            RESUME INTELLIGENCE {ri.candidateName ? `Â· ${ri.candidateName}` : ''}
                          </div>
                          {expandBtn(msg)}
                        </div>
                        <div style={{ display: 'flex', gap: 18, marginBottom: 10, flexWrap: 'wrap' }}>
                          {[{ label: 'CONFIDENCE', val: confidence }, { label: 'GAPS', val: gaps.length }, { label: 'TARGETS', val: targets.length }, { label: 'RED FLAGS', val: redFlags.length }].map(({ label, val }) => (
                            <div key={label}>
                              <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label}</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: label === 'CONFIDENCE' ? (confidence >= 70 ? '#4ADE80' : confidence >= 50 ? '#FCD34D' : '#F87171') : '#E4E4E7' }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {targets.slice(0, 2).map((target, i) => (
                          <div key={i} style={{ fontSize: 12, color: '#A1A1AA', marginBottom: 4 }}>
                            {target.skill || target.claim || `Verification target ${i + 1}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (msg.interviewData) {
                  const iv = msg.interviewData;
                  const config = iv.config || {};
                  const focusAreas = config.focus_areas || config.focusAreas || [];
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(59,130,246,0.22)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(59,130,246,0.6)' }}>INTERVIEW CREATED</div>
                          {expandBtn(msg)}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E4E7', marginBottom: 4 }}>{iv.candidateName}</div>
                        <div style={{ fontSize: 12, color: '#60A5FA', marginBottom: 10 }}>{iv.candidateEmail}</div>
                        <div style={{ display: 'flex', gap: 18, marginBottom: focusAreas.length > 0 ? 10 : 0, flexWrap: 'wrap' }}>
                          {[{ label: 'ROLE', val: config.role || 'General' }, { label: 'LEVEL', val: config.level || 'Mid-Level' }, { label: 'QUESTIONS', val: config.num_questions || config.numQuestions || 0 }].map(({ label, val }) => (
                            <div key={label}>
                              <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#E4E4E7' }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {focusAreas.length > 0 && (
                          <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.5 }}>
                            Focus: {focusAreas.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (msg.reportData) {
                  const rp = msg.reportData;
                  const report = rp.report || {};
                  const scores = Array.isArray(report.scores) ? report.scores : [];
                  const avgScore = report.avgScore ?? (scores.length ? Number((scores.reduce((sum, item) => sum + (item?.score || 0), 0) / scores.length).toFixed(1)) : 'N/A');
                  const summary = stripMarkdown(report.report || '');
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(34,197,94,0.55)' }}>INTERVIEW REPORT</div>
                          {expandBtn(msg)}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E4E7', marginBottom: 8 }}>{rp.candidateName}</div>
                        <div style={{ display: 'flex', gap: 18, marginBottom: summary ? 8 : 0, flexWrap: 'wrap' }}>
                          {[{ label: 'AVG', val: avgScore }, { label: 'EYE CONTACT', val: `${report.eyeContact || 0}%` }, { label: 'VIOLATIONS', val: report.violations || 0 }].map(({ label, val }) => (
                            <div key={label}>
                              <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label}</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: '#E4E4E7' }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {summary && (
                          <div style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.5 }}>
                            {summary.slice(0, 180)}{summary.length > 180 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (msg.credibilityData) {
                  const cr = msg.credibilityData;
                  const credibility = cr.credibility || {};
                  const insights = credibility.key_insights || [];
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(139,92,246,0.22)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(139,92,246,0.6)' }}>CREDIBILITY ANALYSIS</div>
                          {expandBtn(msg)}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E4E7', marginBottom: 8 }}>{cr.candidateName}</div>
                        <div style={{ display: 'flex', gap: 18, marginBottom: insights.length > 0 ? 8 : 0, flexWrap: 'wrap' }}>
                          {[{ label: 'SCORE', val: `${credibility.credibility_score || 0}/100` }, { label: 'RECOMMENDATION', val: credibility.hiring_recommendation || 'N/A' }].map(({ label, val }) => (
                            <div key={label}>
                              <div style={{ fontSize: 9, color: '#52525B', letterSpacing: '0.1em' }}>{label}</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: '#E4E4E7' }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {insights.slice(0, 2).map((insight, i) => (
                          <div key={i} style={{ fontSize: 12, color: '#A1A1AA', lineHeight: 1.5, marginBottom: 4 }}>{insight}</div>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (msg.exportData) {
                  const ex = msg.exportData;
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(59,130,246,0.22)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(59,130,246,0.6)', marginBottom: 8 }}>PDF REPORT READY</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E4E7', marginBottom: 10 }}>{ex.candidateName}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <a
                            href={ex.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 16px', borderRadius: 100, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93C5FD', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
                          >
                            Open PDF
                          </a>
                          {expandBtn(msg)}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (msg.calendlyData) {
                  const ca = msg.calendlyData;
                  return (
                    <div key={msg.id} className="j-msg" style={{ marginBottom: 18 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(99,102,241,0.6)', marginBottom: 8 }}>CALENDLY SCHEDULING LINK</div>
                        {ca.url && <a href={ca.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#818CF8', wordBreak: 'break-all', display: 'block', marginBottom: 6 }}>{ca.url}</a>}
                        {ca.eventTypes && <div style={{ fontSize: 11, color: '#52525B' }}>{ca.eventTypes}</div>}
                      </div>
                    </div>
                  );
                }

                // â”€â”€ Simple action status line
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
                      âœ“ {msg.content}
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

        {/* â”€â”€ ZONE 3: Input bar â”€â”€ */}
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
                voice.isRecording    ? 'Recordingâ€¦ (or type here)' :
                voice.isTranscribing ? 'Transcribingâ€¦' :
                isProcessing         ? 'Jarvis is thinkingâ€¦' :
                'Type a message, or let Jarvis keep listening'
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
                voice.speakingMsgIndex !== null ? 'Interrupt Jarvis and reply' :
                voice.isRecording               ? 'Pause listening' :
                                                  'Resume listening'
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
              ? 'RECORDING Â· PAUSE TO SEND AUTOMATICALLY'
              : voice.speakingMsgIndex !== null
                ? 'JARVIS SPEAKING Â· CLICK ORB OR MIC TO INTERRUPT'
                : 'TYPE OR CLICK MIC TO SPEAK Â· SILENCE STOPS RECORDING'}
          </div>
        </div>

      </div>
    </>
  );
}

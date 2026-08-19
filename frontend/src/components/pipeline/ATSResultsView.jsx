import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, MinusCircle, XCircle, Zap, Users, ChevronDown, ChevronUp, ArrowLeft, Mic, Video, Clock } from 'lucide-react';
import BatchActionConfirm from './BatchActionConfirm';

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com')
  : '';

// Maps backend Interview.status to a small badge style + label.
const STATUS_BADGE = {
  pending:     { label: 'Invited',     color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
  in_progress: { label: 'In progress', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)'  },
  completed:   { label: 'Done',        color: '#22C55E', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)'   },
};

function InterviewStatusBadge({ info }) {
  if (!info) return null;
  const cfg = STATUS_BADGE[info.status] || null;
  if (!cfg) return null;
  const ModeIcon = info.mode === 'conversational' ? Mic : Video;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
      textTransform: 'uppercase', letterSpacing: '0.03em',
    }} title={`${info.mode === 'conversational' ? 'Voice' : 'Avatar'} interview — ${cfg.label}`}>
      {info.status === 'in_progress' ? <Clock size={10} /> : <ModeIcon size={10} />}
      {cfg.label}
    </span>
  );
}

const VERDICT_CONFIG = {
  'Strong Fit':  { color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)',  icon: CheckCircle,   bar: '#22C55E' },
  'Good Fit':    { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)', icon: CheckCircle,   bar: '#3B82F6' },
  'Consider':    { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: MinusCircle,   bar: '#F59E0B' },
  'No Match':    { color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',   icon: XCircle,       bar: '#EF4444' },
};

const TABS = ['All', 'Strong Fit', 'Good Fit', 'Consider', 'No Match'];

function ScoreBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8', marginBottom: 3 }}>
        <span>{label}</span><span style={{ color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function CandidateCard({ result, selected, onToggle, interviewInfo }) {
  const [expanded, setExpanded] = useState(false);
  const vc = VERDICT_CONFIG[result.verdict] || VERDICT_CONFIG['No Match'];
  const Icon = vc.icon;
  const score = result.ats_score;
  const scoreColor = score >= 75 ? '#22C55E' : score >= 55 ? '#3B82F6' : score >= 35 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{
      background: selected ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
      border: selected ? '1px solid rgba(139,92,246,0.4)' : `1px solid ${vc.border}`,
      borderRadius: 14, marginBottom: 10, overflow: 'hidden',
      transition: 'border 0.2s',
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => onToggle(result.candidate_id)}>
        {/* Checkbox */}
        <div style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: selected ? 'none' : '2px solid rgba(255,255,255,0.2)',
          background: selected ? '#8B5CF6' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" fill="none" /></svg>}
        </div>

        {/* ATS score badge */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: `conic-gradient(${scoreColor} ${score * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#0F172A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: scoreColor,
          }}>{score}</div>
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9' }}>{result.name}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
              background: vc.bg, border: `1px solid ${vc.border}`, color: vc.color,
            }}>{result.verdict}</span>
            <InterviewStatusBadge info={interviewInfo} />
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            {result.predicted_role || '—'} · {result.total_experience_years || 0}y exp
            {result.location ? ` · ${result.location}` : ''}
          </div>
        </div>

        {/* Expand toggle */}
        <button onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginTop: 14 }}>
            <ScoreBar label="Skills Match" value={result.skills_match} color="#8B5CF6" />
            <ScoreBar label="Experience Match" value={result.experience_match} color="#3B82F6" />
            <ScoreBar label="Role Relevance" value={result.role_match} color="#22C55E" />
            <ScoreBar label="Education" value={result.education_match} color="#F59E0B" />
          </div>

          {result.matched_skills?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginBottom: 6 }}>Matched Skills</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {result.matched_skills.map((s, i) => (
                  <span key={i} style={pillStyle('#22C55E')}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {result.missing_skills?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>Missing Skills</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {result.missing_skills.map((s, i) => (
                  <span key={i} style={pillStyle('#EF4444')}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {result.summary && (
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, lineHeight: 1.6 }}>{result.summary}</p>
          )}
          {result.auto_reject && result.rejection_reason && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#FCA5A5' }}>
              Auto-filtered: {result.rejection_reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pillStyle(color) {
  return {
    display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    background: `${color}15`, border: `1px solid ${color}30`, color,
  };
}

/* `embedded` drops the full-page shell so this can render inside the Screening
 * tab. It was written as a standalone takeover because the only thing that
 * could open it was the voice agent's full-screen overlay; now that Screening
 * is a section with its own nav entry, it has to sit in the workspace and
 * inherit the page background rather than paint its own.
 *
 * The palette here is still the hardcoded slate/violet set that exists nowhere
 * else in the app -- that gets replaced when this moves onto RankedCandidates. */
export default function ATSResultsView({ pipelineResult, onBack, onRunAgain, embedded = false }) {
  const [activeTab, setActiveTab] = useState('All');
  const [selectedIds, setSelectedIds] = useState(() =>
    (pipelineResult?.shortlist || []).map(r => r.candidate_id)
  );
  const [showBatchModal, setShowBatchModal] = useState(false);
  // Map of email -> { status, mode, id } for the small interview badge on each
  // candidate card. Fetched once on mount; failures are silent (badge just
  // doesn't render).
  const [interviewStatuses, setInterviewStatuses] = useState({});

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('resumate_hm_token') || '';
    fetch(`${API_BASE}/api/chat/interview-statuses`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data?.statuses) setInterviewStatuses(data.statuses); })
      .catch(() => { /* silent — badge just hides */ });
    return () => { cancelled = true; };
  }, []);

  if (!pipelineResult) return null;

  const { role, total_screened, stats, results = [], jd_requirements } = pipelineResult;

  // Default sort: highest ATS score first. The backend usually returns sorted
  // already, but a defensive sort here makes the UI behave even if it doesn't.
  const sortedResults = [...results].sort(
    (a, b) => (b?.ats_score ?? 0) - (a?.ats_score ?? 0)
  );
  const filtered = activeTab === 'All' ? sortedResults : sortedResults.filter(r => r.verdict === activeTab);

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(r => r.candidate_id));
    }
  };

  const selectedCandidates = results.filter(r => selectedIds.includes(r.candidate_id));

  return (
    <div style={embedded
      ? { color: '#F1F5F9' }
      : { minHeight: '100vh', background: '#0B1120', color: '#F1F5F9', padding: '24px 20px' }}>
      <div style={{ maxWidth: embedded ? '100%' : 860, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
              <Zap size={18} style={{ color: '#8B5CF6', marginRight: 8, verticalAlign: 'middle' }} />
              AutoHire Results — <span style={{ color: '#8B5CF6' }}>{role}</span>
            </h1>
            <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
              {total_screened} resumes screened
              {jd_requirements?.required_skills?.length > 0 && ` · ${jd_requirements.required_skills.length} required skills`}
            </p>
          </div>
          <button onClick={onRunAgain} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', border: 'none', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} /> Run Again
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Strong Fit', count: stats.strong_fit, color: '#22C55E' },
            { label: 'Good Fit',   count: stats.good_fit,   color: '#3B82F6' },
            { label: 'Consider',   count: stats.consider,   color: '#F59E0B' },
            { label: 'No Match',   count: stats.no_match,   color: '#EF4444' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* JD skills used */}
        {jd_requirements?.required_skills?.length > 0 && (
          <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#8B5CF6', fontWeight: 700 }}>Screening criteria:</span>
            {jd_requirements.required_skills.map((s, i) => (
              <span key={i} style={pillStyle('#8B5CF6')}>{s}</span>
            ))}
            {jd_requirements.min_experience_years > 0 && (
              <span style={pillStyle('#3B82F6')}>{jd_requirements.min_experience_years}+ years</span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {TABS.map(tab => {
            const count = tab === 'All' ? results.length : results.filter(r => r.verdict === tab).length;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: activeTab === tab ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                border: activeTab === tab ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color: activeTab === tab ? '#C4B5FD' : '#94A3B8',
              }}>
                {tab} <span style={{ opacity: 0.6 }}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* Select all row */}
        {filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={toggleAll} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}>
              {selectedIds.length === filtered.length ? 'Deselect all' : 'Select all'}
            </button>
            <span style={{ fontSize: 12, color: '#64748B' }}>{selectedIds.length} selected</span>
          </div>
        )}

        {/* Candidate cards */}
        {filtered.length === 0
          ? <p style={{ color: '#64748B', textAlign: 'center', padding: '40px 0' }}>No candidates in this category.</p>
          : filtered.map(r => (
              <CandidateCard
                key={r.candidate_id}
                result={r}
                selected={selectedIds.includes(r.candidate_id)}
                onToggle={toggleSelect}
                interviewInfo={interviewStatuses[(r.email || '').toLowerCase()]}
              />
            ))
        }

        {/* Sticky batch action bar */}
        {selectedIds.length > 0 && (
          <div style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg,#1E293B,#0F172A)',
            border: '1px solid rgba(139,92,246,0.35)', borderRadius: 16,
            padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 100, maxWidth: '90vw',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} style={{ color: '#8B5CF6' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>{selectedIds.length} selected</span>
            </div>
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
            <button
              onClick={() => setShowBatchModal(true)}
              style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} /> Create Interviews + Draft Emails
            </button>
            <button onClick={() => setSelectedIds([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }}>
              <XCircle size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Batch action modal */}
      {showBatchModal && (
        <BatchActionConfirm
          selectedCandidates={selectedCandidates}
          role={role}
          onClose={() => setShowBatchModal(false)}
          onDone={() => { setShowBatchModal(false); setSelectedIds([]); }}
        />
      )}
    </div>
  );
}

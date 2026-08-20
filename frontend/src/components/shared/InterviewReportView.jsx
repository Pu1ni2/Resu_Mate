import React, { useState } from 'react';
import { marked } from 'marked';
import { CheckCircle, AlertCircle, Shield, XCircle, EyeOff, FileText, TrendingUp, Target, Loader, Download, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { toast } from '../../services/notify';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

function SafeMarkdown({ text }) {
  if (!text || typeof text !== 'string') return null;
  try {
    return <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(text) }} />;
  } catch (e) {
    console.error('Markdown parse error:', e);
    return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px' }}>{text}</pre>;
  }
}

function CredibilityBadge({ score }) {
  const color = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444';
  const label = score >= 80 ? 'Highly Credible' : score >= 60 ? 'Credible' : score >= 40 ? 'Partially Credible' : 'Low Credibility';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', border: `1px solid ${color}30`, background: `${color}10`, fontSize: '12px', fontWeight: '700', color }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {label} — {score}/100
    </div>
  );
}

function SkillTag({ skill, type }) {
  const colors = {
    confirmed: { bg: '#22C55E15', border: '#22C55E30', text: '#22C55E' },
    overrated: { bg: '#EF444415', border: '#EF444430', text: '#EF4444' },
    unverified: { bg: '#94A3B815', border: '#94A3B830', text: '#94A3B8' },
    hidden: { bg: '#3B82F615', border: '#3B82F630', text: '#3B82F6' },
  };
  const c = colors[type] || colors.unverified;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: '11px', fontWeight: '600', marginRight: '4px', marginBottom: '4px' }}>
      {skill}
    </span>
  );
}

function CredibilitySection({ candidateId, candidateEmail }) {
  const [credibility, setCredibility] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCredibility = async () => {
    if (!candidateId || !candidateEmail) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await authFetch(`${API_BASE}/api/chat/credibility-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId, candidate_email: candidateEmail }),
      });
      if (!resp.ok) throw new Error('Analysis unavailable');
      const data = await resp.json();
      setCredibility(data.credibility);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!candidateId || !candidateEmail) return null;

  if (!credibility && !loading && !error) {
    return (
      <div className="cd-card" style={{ padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
        <button onClick={fetchCredibility} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          <Target size={15} /> Run Credibility Analysis
        </button>
        <p style={{ color: '#94A3B8', fontSize: '11px', marginTop: '8px' }}>Cross-reference resume claims against interview performance</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cd-card" style={{ padding: '28px', marginBottom: '16px', textAlign: 'center' }}>
        <Loader size={20} className="spin" style={{ color: '#8B5CF6', marginBottom: '8px' }} />
        <p style={{ color: '#94A3B8', fontSize: '13px' }}>Analyzing credibility...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cd-card" style={{ padding: '20px', marginBottom: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
        Credibility analysis unavailable: {error}
      </div>
    );
  }

  const c = credibility;
  const rvi = c.resume_vs_interview || {};
  const la = c.level_assessment || {};

  return (
    <div className="cd-card" style={{ padding: '24px', marginBottom: '16px', borderColor: 'rgba(139,92,246,0.2)' }}>
      <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Target size={16} style={{ color: '#8B5CF6' }} /> Credibility Analysis
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <CredibilityBadge score={c.credibility_score || 0} />
        <span style={{ fontSize: '12px', color: '#94A3B8' }}>Confidence: {c.confidence_in_assessment || 'Medium'}</span>
      </div>

      {/* Skills Comparison */}
      <div style={{ marginBottom: '14px' }}>
        {(rvi.confirmed_skills || []).length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#22C55E', display: 'block', marginBottom: '4px' }}>Confirmed in Interview</span>
            {rvi.confirmed_skills.map((s, i) => <SkillTag key={i} skill={s} type="confirmed" />)}
          </div>
        )}
        {(rvi.overrated_skills || []).length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#EF4444', display: 'block', marginBottom: '4px' }}>Overrated (claimed but underperformed)</span>
            {rvi.overrated_skills.map((s, i) => <SkillTag key={i} skill={s} type="overrated" />)}
          </div>
        )}
        {(rvi.hidden_strengths || []).length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#3B82F6', display: 'block', marginBottom: '4px' }}>Hidden Strengths (not on resume)</span>
            {rvi.hidden_strengths.map((s, i) => <SkillTag key={i} skill={s} type="hidden" />)}
          </div>
        )}
        {(rvi.unverified_skills || []).length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>Unverified</span>
            {rvi.unverified_skills.slice(0, 6).map((s, i) => <SkillTag key={i} skill={s} type="unverified" />)}
          </div>
        )}
      </div>

      {/* Level Assessment */}
      <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg3, rgba(255,255,255,0.04))', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <TrendingUp size={14} style={{ color: '#8B5CF6' }} />
          <span style={{ fontSize: '12px', fontWeight: '700' }}>Level Assessment</span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2, #94A3B8)' }}>
          Resume claims: <strong>{la.resume_claims || '—'}</strong> → Interview suggests: <strong style={{ color: la.match ? '#22C55E' : '#F59E0B' }}>{la.interview_suggests || '—'}</strong>
          {la.explanation && <span> — {la.explanation}</span>}
        </div>
      </div>

      {/* Key Insights */}
      {(c.key_insights || []).length > 0 && (
        <div>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3, #64748B)', display: 'block', marginBottom: '6px' }}>Key Insights</span>
          {c.key_insights.map((insight, i) => (
            <p key={i} style={{ fontSize: '12px', color: 'var(--text2, #94A3B8)', marginBottom: '4px', paddingLeft: '10px', borderLeft: '2px solid rgba(139,92,246,0.3)' }}>{insight}</p>
          ))}
        </div>
      )}

      {/* Recommendation */}
      <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.1))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '600' }}>Hiring Recommendation</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#8B5CF6' }}>{c.hiring_recommendation || '—'}</span>
      </div>
    </div>
  );
}

function TranscriptSection({ transcript }) {
  const [open, setOpen] = useState(false);
  if (!transcript || transcript.length === 0) return null;

  return (
    <div className="cd-card" style={{ padding: '20px', marginBottom: '16px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <h3 style={{ fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
          <MessageSquare size={16} style={{ color: '#3B82F6' }} /> Conversation Transcript
          <span style={{ fontSize: '12px', fontWeight: '400', color: '#94A3B8' }}>({transcript.length} turns)</span>
        </h3>
        {open ? <ChevronUp size={16} style={{ color: '#94A3B8' }} /> : <ChevronDown size={16} style={{ color: '#94A3B8' }} />}
      </button>

      {open && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {transcript.map((turn, i) => {
            const isInterviewer = turn.role === 'interviewer';
            return (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexDirection: isInterviewer ? 'row' : 'row-reverse' }}>
                <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700',
                  background: isInterviewer ? 'linear-gradient(135deg,#3B82F6,#6D28D9)' : 'rgba(255,255,255,0.08)',
                  color: isInterviewer ? '#fff' : '#94A3B8', border: isInterviewer ? 'none' : '1px solid rgba(255,255,255,0.1)'
                }}>
                  {isInterviewer ? 'AI' : 'C'}
                </div>
                <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '12px', fontSize: '13px', lineHeight: '1.5',
                  background: isInterviewer ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
                  border: isInterviewer ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text, #E2E8F0)'
                }}>
                  {turn.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* `viewer` decides which controls render.
 *
 * Two of the actions in here -- credibility analysis and PDF export -- call
 * endpoints guarded by get_current_user, i.e. hiring-manager only. This
 * component, however, was mounted solely in the candidate portal, where that
 * token does not exist and never will. Both buttons therefore failed 401 for
 * the only people who could see them.
 *
 * Sending "the right token" would not fix it: a candidate has no manager token
 * by design. Credibility analysis in particular compares someone's resume
 * claims against their interview answers to detect exaggeration -- that is a
 * manager's tool, and showing it to the candidate being assessed was a product
 * mistake as much as an auth one.
 *
 * So they render for viewer="manager" only. Candidate-side PDF export is a
 * reasonable feature, but it needs a candidate-scoped endpoint that does not
 * exist yet; a button that always fails is worse than no button.
 */
export default function InterviewReportView({ report, candidateId, candidateEmail, viewer = 'candidate' }) {
  const isManager = viewer === 'manager';
  if (!report) return <p style={{ color: '#94A3B8', textAlign: 'center', padding: '40px' }}>No report data available.</p>;

  const r = report;
  const avgScore = r.avgScore || (r.scores?.length > 0 ? (r.scores.reduce((a, s) => a + (s?.score || 0), 0) / r.scores.length).toFixed(1) : '—');
  const eyeContact = r.eyeContact || 0;
  const violations = r.violations || 0;
  const timerVal = r.timer || 0;
  const mins = Math.floor(timerVal / 60);
  const secs = String(timerVal % 60).padStart(2, '0');
  const scores = Array.isArray(r.scores) ? r.scores : [];
  const reportText = typeof r.report === 'string' ? r.report : '';

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      {/* Header */}
      <div className="cd-card" style={{ padding: '28px', textAlign: 'center', marginBottom: '16px' }}>
        {r.terminated
          ? <AlertCircle size={40} style={{ color: '#EF4444', marginBottom: '12px' }} />
          : <CheckCircle size={40} style={{ color: '#22C55E', marginBottom: '12px' }} />
        }
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '6px' }}>
          {r.terminated ? 'Interview Terminated' : 'Interview Completed'}
        </h2>
        <p style={{ color: '#64748B', fontSize: '14px' }}>
          {scores.length} questions answered · {mins}:{secs} duration
        </p>
        {isManager && candidateEmail && (
          <button onClick={async () => {
            // Export-report now requires auth, so we fetch with the bearer
            // token and trigger a blob download instead of window.open (which
            // can't carry an Authorization header).
            try {
              const resp = await authFetch(
                `${API_BASE}/api/chat/export-report/${encodeURIComponent(candidateEmail)}`
              );
              if (!resp.ok) { toast('Could not export report (you may not have access).', 'error'); return; }
              const blob = await resp.blob();
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `${candidateEmail}-report.pdf`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(link.href);
            } catch {
              toast('Could not export report. Please try again.', 'error');
            }
          }} style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
            <Download size={14} /> Export PDF Report
          </button>
        )}
        {r.terminated && (
          <div style={{ marginTop: '12px', padding: '10px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#DC2626', fontSize: '13px', fontWeight: '600' }}>
            Terminated: exceeded proctoring violations limit
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { val: avgScore, label: 'Avg Score' },
          { val: `${eyeContact}%`, label: 'Eye Contact' },
          { val: violations, label: 'Violations', color: violations > 0 ? '#EF4444' : '#22C55E' },
          { val: `${mins}:${secs}`, label: 'Duration' },
        ].map((s, i) => (
          <div key={i} className="cd-card" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'monospace', color: s.color || 'var(--text)' }}>{s.val}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Score Breakdown */}
      {scores.length > 0 && (
        <div className="cd-card" style={{ padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px' }}>Score Breakdown</h3>
          {scores.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', width: '28px' }}>Q{i + 1}</span>
              <div style={{ flex: 1, maxWidth: '180px', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${(s?.score || 0) * 10}%`, height: '100%', borderRadius: '3px', transition: 'width 0.5s',
                  background: (s?.score || 0) >= 7 ? '#22C55E' : (s?.score || 0) >= 4 ? '#F59E0B' : '#EF4444' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '700', width: '36px' }}>{s?.score || 0}/10</span>
              {s?.feedback && <span style={{ fontSize: '12px', color: '#94A3B8', flex: 1 }}>{s.feedback}</span>}
            </div>
          ))}
        </div>
      )}

      {/* AI Report */}
      {reportText.length > 5 && (
        <div className="cd-card" style={{ padding: '24px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} style={{ color: '#3B82F6' }} /> Evaluation
          </h3>
          <SafeMarkdown text={reportText} />
        </div>
      )}

      {/* Conversation Transcript */}
      <TranscriptSection transcript={r.transcript} />

      {/* Credibility Analysis */}
      {isManager && <CredibilitySection candidateId={candidateId} candidateEmail={candidateEmail} />}

      {/* Proctoring */}
      {(violations > 0 || (r.lookAwayCount || 0) > 10) && (
        <div className="cd-card" style={{ padding: '20px', marginBottom: '16px', borderColor: 'rgba(239,68,68,0.2)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={14} /> Proctoring Summary
          </h3>
          {violations > 0 && (
            <p style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <XCircle size={13} style={{ color: '#F59E0B' }} /> {violations} violation{violations > 1 ? 's' : ''} detected
            </p>
          )}
          {(r.lookAwayCount || 0) > 10 && (
            <p style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <EyeOff size={13} style={{ color: '#F59E0B' }} /> Gaze aversion: {r.lookAwayCount} times
            </p>
          )}
        </div>
      )}
    </div>
  );
}

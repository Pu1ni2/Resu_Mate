import React from 'react';
import { marked } from 'marked';
import { CheckCircle, AlertCircle, Shield, XCircle, EyeOff, Brain } from 'lucide-react';

function SafeMarkdown({ text }) {
  if (!text || typeof text !== 'string') return null;
  try {
    return <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(text) }} />;
  } catch (e) {
    console.error('Markdown parse error:', e);
    return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px' }}>{text}</pre>;
  }
}

export default function InterviewReportView({ report }) {
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
            <Brain size={16} style={{ color: '#3B82F6' }} /> AI Evaluation
          </h3>
          <SafeMarkdown text={reportText} />
        </div>
      )}

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

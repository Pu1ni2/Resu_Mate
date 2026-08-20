import React, { useState } from 'react';
import { X, Zap, Mail, Video, Mic, CheckCircle, Loader, AlertCircle, Send } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { toast } from '../../services/notify';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

export default function BatchActionConfirm({ selectedCandidates, role, onClose, onDone }) {
  const [level, setLevel] = useState('Mid-Level');
  const [numQuestions, setNumQuestions] = useState(8);
  const [emailType, setEmailType] = useState('interview');
  const [sendEmails, setSendEmails] = useState(false);
  // Same format toggle as InterviewCreator: avatar (LiveKit + Simli) vs
  // conversational (audio-only OpenAI Realtime). Applies to every interview
  // created by this batch confirm.
  const [interviewMode, setInterviewMode] = useState('avatar');
  const [candidateToggles, setCandidateToggles] = useState(() =>
    Object.fromEntries(selectedCandidates.map(c => [c.candidate_id, { interview: true, email: true }]))
  );
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const toggle = (id, field) => {
    setCandidateToggles(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: !prev[id][field] },
    }));
  };

  const activeIds = selectedCandidates
    .filter(c => candidateToggles[c.candidate_id]?.interview || candidateToggles[c.candidate_id]?.email)
    .map(c => c.candidate_id);

  const handleConfirm = async () => {
    setRunning(true);
    try {
      const interviewIds = selectedCandidates
        .filter(c => candidateToggles[c.candidate_id]?.interview)
        .map(c => c.candidate_id);

      const res = await authFetch(`${API_BASE}/api/pipeline/batch-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_ids: interviewIds,
          role,
          level,
          num_questions: numQuestions,
          email_type: emailType,
          send_emails: sendEmails,
          mode: interviewMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Batch action failed');
      }
      const data = await res.json();
      setResults(data);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
      setRunning(false);
    }
  };

  // â”€â”€ Results view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (results) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <h3 style={styles.title}>
            <CheckCircle size={20} style={{ color: 'var(--color-positive)' }} /> Actions Complete
          </h3>
          <div style={styles.statsRow}>
            <StatBox value={results.interviews_created} label="Interviews Created" color="var(--color-positive)" />
            <StatBox value={results.emails_sent} label="Emails Sent" color="var(--color-positive)" />
            <StatBox value={results.total} label="Total Processed" color="var(--color-ink-muted)" />
          </div>

          {/* Per-candidate outcome */}
          <div style={styles.outcomeList}>
            {results.outcomes.map(o => (
              <div key={o.candidate_id} style={styles.outcomeRow}>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{o.name}</span>
                <span style={{ fontSize: 12, color: o.interview_created ? 'var(--color-positive)' : 'var(--color-critical)' }}>
                  {o.interview_created ? 'âœ“ Interview' : 'âœ— Interview'}
                </span>
                <span style={{ fontSize: 12, color: o.email_drafted ? 'var(--color-positive)' : 'var(--color-ink-subtle)', marginLeft: 10 }}>
                  {o.email_drafted ? 'âœ“ Email drafted' : 'âœ— Email'}
                </span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 16 }}>
            Candidates can now log in at <strong style={{ color: 'var(--color-accent)' }}>/candidate/login</strong> using their email and OTP.
          </p>

          <button onClick={onDone} style={styles.primaryBtn}>Done</button>
        </div>
      </div>
    );
  }

  // â”€â”€ Confirm view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onClose} style={styles.closeBtn}><X size={16} /></button>

        <h3 style={styles.title}>
          <Zap size={18} style={{ color: 'var(--color-accent)' }} />
          Confirm Batch Actions
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 20 }}>
          For each candidate, choose whether to create an interview and/or draft an email.
        </p>

        {/* Interview format â€” avatar vs conversational. Mirrors the toggle in
            InterviewCreator so the wizard / Jarvis / batch flows all expose the
            same choice. */}
        <div style={{ marginBottom: 14 }}>
          <label style={styles.label}>Interview format</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setInterviewMode('avatar')}
              style={{
                padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                borderRadius: 10,
                background: interviewMode === 'avatar' ? 'var(--color-accent-wash)' : 'var(--color-surface-raised)',
                border: `1px solid ${interviewMode === 'avatar' ? 'var(--color-accent)' : 'var(--color-line)'}`,
                color: 'var(--color-ink)', display: 'flex', flexDirection: 'column', gap: 3,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Video size={12} /> Avatar interview
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Camera + lip-synced AI face</span>
            </button>
            <button
              type="button"
              onClick={() => setInterviewMode('conversational')}
              style={{
                padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                borderRadius: 10,
                background: interviewMode === 'conversational' ? 'var(--color-accent-wash)' : 'var(--color-surface-raised)',
                border: `1px solid ${interviewMode === 'conversational' ? 'var(--color-accent)' : 'var(--color-line)'}`,
                color: 'var(--color-ink)', display: 'flex', flexDirection: 'column', gap: 3,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mic size={12} /> Voice conversation
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Audio-only, low-latency</span>
            </button>
          </div>
        </div>

        {/* Interview config */}
        <div style={styles.configRow}>
          <div style={styles.configField}>
            <label style={styles.label}>Level</label>
            <select value={level} onChange={e => setLevel(e.target.value)} style={styles.select}>
              {['Entry-Level', 'Mid-Level', 'Senior', 'Lead'].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div style={styles.configField}>
            <label style={styles.label}>Questions</label>
            <select value={numQuestions} onChange={e => setNumQuestions(+e.target.value)} style={styles.select}>
              {[5, 8, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={styles.configField}>
            <label style={styles.label}>Email type</label>
            <select value={emailType} onChange={e => setEmailType(e.target.value)} style={styles.select}>
              <option value="interview">Interview Invite</option>
              <option value="interest">Expression of Interest</option>
            </select>
          </div>
        </div>

        {/* Send emails toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', background: sendEmails ? 'var(--color-accent-wash)' : 'var(--color-surface-raised)', border: `1px solid ${sendEmails ? 'var(--color-accent-line)' : 'var(--color-line)'}`, borderRadius: 10 }}>
          <input type="checkbox" id="sendEmails" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="sendEmails" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: sendEmails ? 'var(--color-accent)' : 'var(--color-ink-muted)' }}>
            <Send size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Actually send emails (requires SendGrid configured)
          </label>
        </div>

        {/* Candidate list with toggles */}
        <div style={styles.candidateList}>
          {selectedCandidates.map(c => {
            const tog = candidateToggles[c.candidate_id] || { interview: true, email: true };
            return (
              <div key={c.candidate_id} style={styles.candidateRow}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{c.name}</p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--color-ink-subtle)' }}>
                    ATS {c.ats_score} Â· {c.verdict}
                    {c.email ? ` Â· ${c.email}` : ' Â· no email'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ToggleChip
                    icon={<Video size={12} />}
                    label="Interview"
                    active={tog.interview}
                    color="var(--color-accent)"
                    onClick={() => toggle(c.candidate_id, 'interview')}
                  />
                  <ToggleChip
                    icon={<Mail size={12} />}
                    label="Email"
                    active={tog.email}
                    color="var(--color-accent)"
                    onClick={() => toggle(c.candidate_id, 'email')}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {!sendEmails && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'var(--color-caution-wash)', border: '1px solid var(--color-caution)', borderRadius: 8, fontSize: 12, color: 'var(--color-caution)', marginBottom: 16 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Emails will be drafted but not sent. You can copy them after.
          </div>
        )}

        <button onClick={handleConfirm} disabled={running || activeIds.length === 0} style={{ ...styles.primaryBtn, opacity: activeIds.length > 0 ? 1 : 0.5 }}>
          {running
            ? <><Loader size={14} className="spin" /> Processing {selectedCandidates.length} candidates...</>
            : <><Zap size={14} /> Confirm â€” {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''}</>}
        </button>
      </div>
    </div>
  );
}

function ToggleChip({ icon, label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
      borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      background: active ? 'var(--color-accent-wash)' : 'var(--color-surface-raised)',
      border: `1px solid ${active ? color : 'var(--color-line)'}`,
      color: active ? color : 'var(--color-ink-subtle)', transition: 'all 0.15s',
    }}>
      {icon} {label}
    </button>
  );
}

function StatBox({ value, label, color }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 30, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--color-ink-subtle)' }}>{label}</div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1100,
    // A scrim over the page, not a themed surface, so it stays a literal.
    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-line)', borderRadius: 20,
    padding: 28, width: '100%', maxWidth: 540,
    position: 'relative', boxShadow: 'var(--shadow-e3)',
    maxHeight: '90vh', overflowY: 'auto',
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    background: 'var(--color-surface-raised)', border: 'none', borderRadius: 8,
    padding: '5px 7px', cursor: 'pointer', color: 'var(--color-ink-muted)',
  },
  title: {
    fontSize: 18, fontWeight: 800, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-ink)',
  },
  primaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 20px',
    background: 'var(--color-accent)',
    color: 'var(--color-ink-inverse)', border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  configRow: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  configField: { flex: 1, minWidth: 120 },
  label: { display: 'block', fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 4 },
  select: {
    width: '100%', background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-line)', borderRadius: 8,
    padding: '8px 10px', color: 'var(--color-ink)', fontSize: 13, outline: 'none',
  },
  candidateList: {
    maxHeight: 260, overflowY: 'auto',
    background: 'var(--color-surface-raised)', borderRadius: 10,
    border: '1px solid var(--color-line)', marginBottom: 16,
  },
  candidateRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    borderBottom: '1px solid var(--color-line)',
  },
  statsRow: {
    display: 'flex', gap: 12, padding: '16px 0', marginBottom: 16,
    borderBottom: '1px solid var(--color-line)',
  },
  outcomeList: {
    marginBottom: 16, maxHeight: 200, overflowY: 'auto',
    background: 'var(--color-surface-raised)', borderRadius: 10,
    border: '1px solid var(--color-line)',
  },
  outcomeRow: {
    display: 'flex', alignItems: 'center', padding: '8px 14px',
    borderBottom: '1px solid var(--color-line)', fontSize: 13,
  },
};

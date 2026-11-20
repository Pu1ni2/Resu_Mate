import React, { useEffect, useState } from 'react';
import { X, Zap, Video, Mic, CheckCircle, Loader, AlertCircle, Send } from 'lucide-react';
import { pending } from '../../services/emailStatus';
import { followBatch, newClientKey, startBatch } from '../../services/inviteBatches';
import { toast } from '../../services/notify';
import { useAvatarInterviews } from '../../services/features';
import PortalLink from '../shared/PortalLink';

export default function BatchActionConfirm({ selectedCandidates, role, onClose, onDone }) {
  const [level, setLevel] = useState('Mid-Level');
  const [numQuestions, setNumQuestions] = useState(8);
  const [sendEmails, setSendEmails] = useState(false);
  // Same format toggle as InterviewCreator: avatar (LiveKit + Simli) vs
  // conversational (audio-only OpenAI Realtime). Applies to every interview
  // created by this batch confirm. Voice by default, which always works;
  // avatar only when the server runs the interview worker it needs.
  const avatarAvailable = useAvatarInterviews();
  const [interviewMode, setInterviewMode] = useState('conversational');
  const [candidateToggles, setCandidateToggles] = useState(() =>
    Object.fromEntries(selectedCandidates.map(c => [c.candidate_id, { interview: true }]))
  );
  const [running, setRunning] = useState(false);
  // The batch as the server last said, from the moment it's started.
  const [batch, setBatch] = useState(null);
  // One key for this dialog: Confirm again, after an answer that didn't
  // arrive, is the same batch, so no one is invited twice.
  const [clientKey] = useState(newClientKey);

  // Each candidate's interview, questions and email are made in the
  // background: follow them until all have finished, or the dialog closes.
  const batchId = batch?.batch_id;
  const finished = Boolean(batch?.finished);
  useEffect(() => {
    if (!batchId || finished) return undefined;
    return followBatch(batchId, setBatch);
  }, [batchId, finished]);

  const toggle = (id, field) => {
    setCandidateToggles(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: !prev[id][field] },
    }));
  };

  const activeIds = selectedCandidates
    .filter(c => candidateToggles[c.candidate_id]?.interview)
    .map(c => c.candidate_id);

  const handleConfirm = async () => {
    setRunning(true);
    try {
      setBatch(await startBatch({
        client_key: clientKey,
        source: 'screening',
        candidate_ids: activeIds,
        role,
        level,
        num_questions: numQuestions,
        send_emails: sendEmails,
        mode: interviewMode,
      }));
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  // ── Results view ────────────────────────────────────────────────────────────

  if (batch?.finished) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <h3 style={styles.title}>
            <CheckCircle size={20} style={{ color: 'var(--color-positive)' }} /> Actions Complete
          </h3>
          <div style={styles.statsRow}>
            <StatBox value={batch.interviews_created} label="Interviews Created" color="var(--color-positive)" />
            <StatBox value={batch.emails_sent} label="Emails Sent" color="var(--color-positive)" />
            <StatBox value={batch.total} label="Total Processed" color="var(--color-ink-muted)" />
          </div>

          {/* Per-candidate outcome, and why when someone wasn't invited or emailed */}
          <div style={styles.outcomeList}>
            {batch.outcomes.map(o => <Outcome key={o.candidate_id} o={o} />)}
          </div>

          {batch.interviews_created > 0 && (batch.emails_sent < batch.interviews_created ? (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', marginBottom: 8 }}>
                Send {batch.emails_sent ? 'the candidates who weren’t emailed' : 'the invited candidates'} this link.
                They sign in with the email address shown above.
              </p>
              <PortalLink link={batch.portal_link} />
            </div>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', marginBottom: 16 }}>
              Each invited candidate was emailed their sign-in link.
            </p>
          ))}

          <button onClick={onDone} style={styles.primaryBtn}>Done</button>
        </div>
      </div>
    );
  }

  // ── Progress view ───────────────────────────────────────────────────────────

  if (batch) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <button onClick={onDone} style={styles.closeBtn} aria-label="Close"><X size={16} /></button>
          <h3 style={styles.title}>
            <Loader size={18} className="spin" style={{ color: 'var(--color-accent)' }} />
            Inviting {batch.total} candidate{batch.total !== 1 ? 's' : ''}…
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', marginBottom: 16 }}>
            This carries on if you close it. Each interview appears under Interviews as soon as it’s ready.
          </p>
          <div style={styles.outcomeList}>
            {batch.outcomes.map(o => <Outcome key={o.candidate_id} o={o} />)}
          </div>
          <button onClick={onDone} style={styles.secondaryBtn}>Close</button>
        </div>
      </div>
    );
  }

  // ── Confirm view ────────────────────────────────────────────────────────────

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Close"><X size={16} /></button>

        <h3 style={styles.title}>
          <Zap size={18} style={{ color: 'var(--color-accent)' }} />
          Confirm Batch Actions
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', marginBottom: 20 }}>
          Choose who gets an interview. Each one can sign in to the candidate portal to take it.
        </p>

        {/* Interview format — avatar vs conversational. Mirrors the toggle in
            InterviewCreator so the wizard / Jarvis / batch flows all expose the
            same choice. */}
        <div style={{ marginBottom: 14 }}>
          <label style={styles.label}>Interview format</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setInterviewMode('avatar')}
              aria-pressed={interviewMode === 'avatar'}
              disabled={!avatarAvailable}
              style={{
                padding: '10px 12px', textAlign: 'left', cursor: avatarAvailable ? 'pointer' : 'not-allowed',
                opacity: avatarAvailable ? 1 : 0.55,
                borderRadius: 10,
                background: interviewMode === 'avatar' ? 'var(--color-accent-wash)' : 'var(--color-surface-raised)',
                border: `1px solid ${interviewMode === 'avatar' ? 'var(--color-accent)' : 'var(--color-line)'}`,
                color: 'var(--color-ink)', display: 'flex', flexDirection: 'column', gap: 3,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Video size={12} /> Avatar interview
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                {avatarAvailable ? 'Camera + lip-synced AI face' : 'Not set up on this server yet'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setInterviewMode('conversational')}
              aria-pressed={interviewMode === 'conversational'}
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
              <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Audio-only, low-latency</span>
            </button>
          </div>
        </div>

        {/* Interview config */}
        <div style={styles.configRow}>
          <div style={styles.configField}>
            <label style={styles.label} htmlFor="batch-level">Level</label>
            <select id="batch-level" value={level} onChange={e => setLevel(e.target.value)} style={styles.select}>
              {['Entry-Level', 'Mid-Level', 'Senior', 'Lead'].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div style={styles.configField}>
            <label style={styles.label} htmlFor="batch-questions">Questions</label>
            <select id="batch-questions" value={numQuestions} onChange={e => setNumQuestions(+e.target.value)} style={styles.select}>
              {[5, 8, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Send emails toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', background: sendEmails ? 'var(--color-accent-wash)' : 'var(--color-surface-raised)', border: `1px solid ${sendEmails ? 'var(--color-accent-line)' : 'var(--color-line)'}`, borderRadius: 10 }}>
          <input type="checkbox" id="sendEmails" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="sendEmails" style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer', color: sendEmails ? 'var(--color-accent)' : 'var(--color-ink-muted)' }}>
            <Send size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Email the invitations to the candidates
          </label>
        </div>

        {/* Candidate list with toggles */}
        <div style={styles.candidateList}>
          {selectedCandidates.map(c => {
            const tog = candidateToggles[c.candidate_id] || { interview: true };
            return (
              <div key={c.candidate_id} style={styles.candidateRow}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{c.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-ink-subtle)' }}>
                    ATS {c.ats_score} · {c.verdict}
                    {c.email ? ` · ${c.email}` : ' · no email'}
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
                </div>
              </div>
            );
          })}
        </div>

        {!sendEmails && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'var(--color-caution-wash)', border: '1px solid var(--color-caution)', borderRadius: 8, fontSize: 12, color: 'var(--color-caution)', marginBottom: 16 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Invitations won’t be emailed. You’ll get a sign-in link to send the candidates yourself.
          </div>
        )}

        <button onClick={handleConfirm} disabled={running || activeIds.length === 0} style={{ ...styles.primaryBtn, opacity: activeIds.length > 0 ? 1 : 0.5 }}>
          {running
            ? <><Loader size={14} className="spin" /> Starting…</>
            : <><Zap size={14} /> Confirm — {activeIds.length} candidate{activeIds.length !== 1 ? 's' : ''}</>}
        </button>
      </div>
    </div>
  );
}

// A step still under way for one candidate.
const UNDER_WAY = {
  queued: 'Waiting its turn…',
  questions: 'Writing the interview questions…',
  drafting: 'Writing the invitation…',
};

// One candidate: what's under way for them, then how it went, and why when
// they weren't invited or emailed.
function Outcome({ o }) {
  const who = (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{o.name || `Candidate #${o.candidate_id}`}</span>
      {o.email && <span style={{ fontSize: 12, color: 'var(--color-ink-subtle)', marginLeft: 8 }}>{o.email}</span>}
    </span>
  );
  // Their invitation, once queued, goes a moment later by the server's
  // outbox, or minutes later when the email service is busy.
  const step = pending({ status: o.email_status }) ? 'Sending the invitation…' : UNDER_WAY[o.status];
  if (step) {
    return (
      <div style={{ ...styles.outcomeRow, flexWrap: 'wrap' }}>
        {who}
        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader size={12} className="spin" /> {step}
        </span>
      </div>
    );
  }
  const reason = o.skipped || o.error
    || (o.interview_created ? o.email_send_error : 'The interview could not be saved. Try again.');
  return (
    <div style={{ ...styles.outcomeRow, flexWrap: 'wrap' }}>
      {who}
      <span style={{ fontSize: 12, color: o.interview_created ? 'var(--color-positive)' : 'var(--color-critical)' }}>
        {o.interview_created ? '✓ Interview' : '✗ Interview'}
      </span>
      <span style={{ fontSize: 12, color: o.email_sent ? 'var(--color-positive)' : 'var(--color-ink-subtle)', marginLeft: 10 }}>
        {o.email_sent ? '✓ Invite emailed' : 'Not emailed'}
      </span>
      {o.reused && (
        <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 4 }}>
          They already had an interview open for this role, so that’s the one they’ll take.
        </span>
      )}
      {reason && (
        <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 4 }}>{reason}</span>
      )}
    </div>
  );
}

function ToggleChip({ icon, label, active, color, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
      borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
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
      <div style={{ fontSize: 12, color: 'var(--color-ink-subtle)' }}>{label}</div>
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
  secondaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 20px',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-ink)', border: '1px solid var(--color-line)', borderRadius: 12,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  configRow: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  configField: { flex: 1, minWidth: 120 },
  label: { display: 'block', fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 4 },
  select: {
    width: '100%', background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-line)', borderRadius: 8,
    padding: '8px 10px', color: 'var(--color-ink)', fontSize: 14, outline: 'none',
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
    borderBottom: '1px solid var(--color-line)', fontSize: 14,
  },
};

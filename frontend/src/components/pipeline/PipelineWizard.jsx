import React, { useState } from 'react';
import { Zap, Loader, FileText, SlidersHorizontal } from 'lucide-react';
import { API_BASE, authFetch } from '../../services/authFetch';
import { toast, notify } from '../../services/notify';

/* Screening: four fields, then the ranked shortlist.
 *
 * There used to be a "Talk to AI Recruiter" mode beside the form, collecting the
 * same four values one spoken question at a time. It is gone. Partly because it
 * was slower than typing them, and partly because it did not work:
 *
 *   - Every question was spoken with the same TTS key, and speakText() treats a
 *     repeated key as "stop talking". Pressing Next while a question was still
 *     playing therefore silenced the NEXT question instead of asking it, so
 *     questions alternated spoken and silent depending on how fast you answered.
 *   - Choosing a mode was one-way: setMode had no reverse, and the close button
 *     is hidden whenever the wizard is inline, which is always.
 *   - The results waited on the spoken summary. The run finished, then the panel
 *     sat on "Screening N resumes..." until the audio had played out.
 *   - None of useVoice's callbacks were wired, so every failure -- too short, no
 *     speech, mic denied -- was silent, and the mic opened during every question
 *     for barge-in detection that nothing listened to.
 *
 * Jarvis still runs this same pipeline by voice. It passes a fresh TTS key per
 * utterance, which is why it never had the first problem.
 */
/* Renders inside the workspace, not as an overlay. It was written as a modal
 * with an `inline` escape hatch, but Screening is a top-level section with its
 * own nav entry, so every call site passed inline -- which also meant the close
 * button was gated behind `!inline` and could never appear, and onClose could
 * never fire. A modal over a tab you just navigated to is a dialog about
 * nothing; the nav is how you leave.
 *
 * candidateIds: the candidates chosen on the Candidates page, when some are.
 * Only they are screened; without it, every résumé is. */
export default function PipelineWizard({ candidateCount = 0, candidateIds, onComplete }) {
  const [formData, setFormData] = useState({ role: '', jdText: '', skills: '', minExp: '' });
  const [formRunning, setFormRunning] = useState(false);

  const parseSkills = (val) =>
    val.split(',').map(s => s.trim()).filter(Boolean);
  const canRun = Boolean(formData.role.trim()) && candidateCount > 0;

  const handleFormRun = async () => {
    if (candidateCount === 0) { toast('Choose at least one résumé to screen.', 'error'); return; }
    if (!formData.role.trim()) { toast('Please enter the role.', 'error'); return; }
    setFormRunning(true);
    try {
      const res = await authFetch(`${API_BASE}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: formData.role.trim(),
          jd_text: formData.jdText.trim() || null,
          min_experience_years: parseFloat(formData.minExp) || 0,
          required_skills: formData.skills ? parseSkills(formData.skills) : [],
          auto_shortlist_count: 5,
          ...(candidateIds?.length ? { candidate_ids: candidateIds } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Screening failed. Please try again.');
      }
      const data = await res.json();
      // A run is the longest operation in the product and people switch away
      // while it works, so it goes to the bell as well. This used to live only
      // on the voice path, which is why it moved here rather than being added.
      notify(
        'Screening complete',
        `${data.total_screened} candidates screened for ${formData.role.trim()} — `
        + `${data.stats?.strong_fit ?? 0} strong, ${data.stats?.good_fit ?? 0} good`,
        'success',
      );
      // Before onComplete, which unmounts this component today. If a future
      // caller keeps it mounted, the button has to become live again.
      setFormRunning(false);
      onComplete(data);
    } catch (err) {
      // The server's message is written for the manager ("Name the role to
      // screen for."); a "Pipeline error:" prefix only made it read as a fault.
      toast(err.message, 'error');
      setFormRunning(false);
    }
  };

  return (
    <div className="studio-screening" data-running={formRunning} style={styles.shell}>
      <div className="ss-brief" aria-busy={formRunning} style={styles.card}>
        <div style={{ marginBottom: 20 }}>
          <p className="ss-kicker">THE HIRING BRIEF <span>01 / 02</span></p>
          <h2 style={styles.title}>Screen candidates</h2>
          <p className="ss-form-intro">Tell us what matters for this role.</p>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="wizard-role">Role you&apos;re hiring for *</label>
          <input id="wizard-role" style={styles.input} placeholder="e.g. Senior Backend Engineer"
            value={formData.role} onChange={e => setFormData(f => ({ ...f, role: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="wizard-jd">Job Description <span style={{ color: 'var(--color-ink-subtle)' }}>(optional — paste for better ATS scoring)</span></label>
          <textarea id="wizard-jd" style={{ ...styles.input, height: 120, resize: 'vertical' }}
            placeholder="Paste your JD here..."
            value={formData.jdText} onChange={e => setFormData(f => ({ ...f, jdText: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="wizard-skills">Must-have skills <span style={{ color: 'var(--color-ink-subtle)' }}>(comma-separated, optional)</span></label>
          <input id="wizard-skills" style={styles.input} placeholder="e.g. Python, React, AWS"
            value={formData.skills} onChange={e => setFormData(f => ({ ...f, skills: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="wizard-min-exp">Minimum experience (years) <span style={{ color: 'var(--color-ink-subtle)' }}>(0 to skip)</span></label>
          <input id="wizard-min-exp" style={{ ...styles.input, width: 120 }} type="number" min="0" placeholder="0"
            value={formData.minExp} onChange={e => setFormData(f => ({ ...f, minExp: e.target.value }))} />
        </div>
        {/* Screening scores only what it's asked for: with the role alone it
            compares roles, which is worth saying before the run, not after. */}
        {!formData.jdText.trim() && !formData.skills.trim() && !(parseFloat(formData.minExp) > 0) && (
          <p style={{ fontSize: 12, color: 'var(--color-ink-subtle)', margin: '0 0 12px' }}>
            With only a role, candidates are compared by role alone. Add must-have skills or a job description for a fuller comparison.
          </p>
        )}

        <button className="ss-run" onClick={handleFormRun} disabled={formRunning || !canRun} style={{ ...styles.primaryBtn, marginTop: 8, opacity: canRun ? 1 : 0.5 }}>
          {formRunning ? <><Loader size={16} className="spin" /> Screening {candidateCount} resumes...</> : <><Zap size={16} /> Screen {candidateCount} resumes</>}
        </button>
        <p className="ss-run-note">
          {candidateIds?.length ? 'Only your selected candidates will be screened.' : 'All uploaded résumés will be screened.'} Results belong to this run.
        </p>
      </div>

      {/* Beside the brief: one brief for every person, drawn, the three steps,
          and how many people this run takes in. */}
      <aside className="ss-process">
        <span className="ss-kicker">A CONSISTENT FIRST LOOK</span>
        <h2>Same brief.<br /><em>Every person.</em></h2>
        <div className="ss-dossier-scene" aria-hidden="true">
          <div className="ss-dossier-shadow" />
          <div className="ss-dossier-sheet ss-dossier-sheet--back" />
          <div className="ss-dossier-sheet ss-dossier-sheet--middle" />
          <div className="ss-dossier-sheet ss-dossier-sheet--front">
            <FileText size={23} strokeWidth={1.2} />
            <span>CANDIDATE FILE</span>
            <b>A person.<br /><em>A possibility.</em></b>
            <i /><i /><i />
            <div className="ss-dossier-scan" />
          </div>
          <div className="ss-role-object">
            <SlidersHorizontal size={23} strokeWidth={1.3} />
            <span>ROLE BRIEF</span>
            <b>What<br />matters.</b>
            <i /><i />
          </div>
        </div>
        <p className="ss-process-status" role="status">
          <span aria-hidden="true" />
          {formRunning ? 'Screening against your brief…' : 'Your criteria. A consistent review.'}
        </p>
        <ol>
          <li><b>01</b><div><strong>Set your priorities</strong><p>Role, skills, and experience. Add a job description for more context.</p></div></li>
          <li><b>02</b><div><strong>Look at the evidence</strong><p>Review the ranked results, matched skills, and reasons behind the fit.</p></div></li>
          <li><b>03</b><div><strong>Make the next move</strong><p>Open a candidate file, go deeper, and decide who to meet.</p></div></li>
        </ol>
        <div className="ss-scope">
          <span>IN THIS RUN</span>
          <strong>{String(candidateCount).padStart(2, '0')}</strong>
          <p>{candidateIds?.length ? 'selected candidates' : 'uploaded résumés'}</p>
        </div>
      </aside>
    </div>
  );
}

const styles = {
  shell: { padding: '4px 0 24px' },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-line)',
    borderRadius: 'var(--radius-card)', padding: 'clamp(22px, 3vw, 36px)', width: '100%',
    position: 'relative', boxShadow: 'var(--shadow-e1)',
  },
  title: { fontFamily: 'var(--font-serif)', fontSize: 34, fontWeight: 400, marginBottom: 7, color: 'var(--color-ink)' },
  // Its colour is in studio-screening.css, with the hover.
  primaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 20px',
    color: 'var(--color-ink-inverse)', border: 'none', borderRadius: 'var(--radius-control)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  input: {
    width: '100%', boxSizing: 'border-box', background: '#fbfaf5',
    border: '1px solid var(--color-line)', borderRadius: 'var(--radius-control)',
    padding: '11px 14px', color: 'var(--color-ink)', fontSize: 13,
    fontFamily: 'inherit',
  },
  formGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-ink-muted)', marginBottom: 6 },
};

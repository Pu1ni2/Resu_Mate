import React, { useState } from 'react';
import { Zap, Loader } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { toast, notify } from '../../services/notify';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

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
 * nothing; the nav is how you leave. */
export default function PipelineWizard({ candidateCount = 0, onComplete }) {
  const [formData, setFormData] = useState({ role: '', jdText: '', skills: '', minExp: '' });
  const [formRunning, setFormRunning] = useState(false);

  const parseSkills = (val) =>
    val.split(',').map(s => s.trim()).filter(Boolean);

  const handleFormRun = async () => {
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
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Pipeline failed');
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
      toast('Pipeline error: ' + err.message, 'error');
      setFormRunning(false);
    }
  };

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={{ marginBottom: 20 }}>
          <div style={styles.iconCircle}><Zap size={22} style={{ color: '#8B5CF6' }} /></div>
          <h2 style={styles.title}>Screen candidates</h2>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Role you&apos;re hiring for *</label>
          <input style={styles.input} placeholder="e.g. Senior Backend Engineer"
            value={formData.role} onChange={e => setFormData(f => ({ ...f, role: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Job Description <span style={{ color: '#64748B' }}>(optional — paste for better ATS scoring)</span></label>
          <textarea style={{ ...styles.input, height: 120, resize: 'vertical' }}
            placeholder="Paste your JD here..."
            value={formData.jdText} onChange={e => setFormData(f => ({ ...f, jdText: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Must-have skills <span style={{ color: '#64748B' }}>(comma-separated, optional)</span></label>
          <input style={styles.input} placeholder="e.g. Python, React, AWS"
            value={formData.skills} onChange={e => setFormData(f => ({ ...f, skills: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Minimum experience (years) <span style={{ color: '#64748B' }}>(0 to skip)</span></label>
          <input style={{ ...styles.input, width: 120 }} type="number" min="0" placeholder="0"
            value={formData.minExp} onChange={e => setFormData(f => ({ ...f, minExp: e.target.value }))} />
        </div>

        <button onClick={handleFormRun} disabled={formRunning || !formData.role.trim()} style={{ ...styles.primaryBtn, marginTop: 8, opacity: formData.role.trim() ? 1 : 0.5 }}>
          {formRunning ? <><Loader size={16} className="spin" /> Screening {candidateCount} resumes...</> : <><Zap size={16} /> Screen {candidateCount} resumes</>}
        </button>
      </div>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', justifyContent: 'center', padding: '4px 0 24px' },
  card: {
    background: 'linear-gradient(135deg, #0F172A, #1E293B)',
    border: '1px solid rgba(139,92,246,0.25)',
    borderRadius: 20, padding: 32, width: '100%', maxWidth: 560,
    position: 'relative', boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
  },
  title: { fontSize: 22, fontWeight: 800, textAlign: 'center', marginBottom: 8, color: '#F1F5F9' },
  primaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 20px',
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
    padding: '11px 14px', color: '#F1F5F9', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  },
  formGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 6 },
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Zap, FileText, ChevronRight, Loader, Volume2, Edit2 } from 'lucide-react';
import useVoice from '../../hooks/useVoice';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

const STEPS = [
  { key: 'role',         question: "What role are you hiring for?",                           placeholder: "e.g. Senior Backend Engineer" },
  { key: 'jd',           question: "Do you have a job description? Paste it, speak it, or say skip.", placeholder: "Paste JD here or leave blank to skip..." },
  { key: 'skills',       question: "Any must-have skills? List them separated by commas.",    placeholder: "e.g. Python, React, AWS" },
  { key: 'experience',   question: "Minimum years of experience? Say zero to skip.",          placeholder: "e.g. 3" },
  { key: 'confirm',      question: null,                                                       placeholder: null },
];

/* `inline` renders the wizard inside the workspace instead of as a fixed
 * overlay. It was written as a modal, but Screening is now a top-level section
 * with its own nav entry -- a modal over a tab you just navigated to is a
 * dialog about nothing, and there is no sensible target for its close button. */
export default function PipelineWizard({ candidateCount = 0, onClose, onComplete, inline = false }) {
  const [mode, setMode] = useState(null); // 'voice' | 'form'
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({ role: '', jdText: '', requiredSkills: [], minExperience: 0 });
  const [inputVal, setInputVal] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const inputRef = useRef(null);

  // Voice hook â€” onTranscribed fills the current input
  const voice = useVoice({
    apiBase: API_BASE,
    onTranscribed: (text) => setInputVal(prev => prev ? prev + ' ' + text : text),
  });

  // Speak the current step question via TTS
  const speakQuestion = useCallback(async (text) => {
    if (!text) return;
    setAiSpeaking(true);
    await voice.speakText(text, 'wizard-q');
    setAiSpeaking(false);
  }, [voice]);

  useEffect(() => {
    if (mode === 'voice' && step < STEPS.length - 1 && STEPS[step].question) {
      speakQuestion(STEPS[step].question);
    }
  }, [step, mode]);

  // Focus input when step changes
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [step]);

  const currentStep = STEPS[step];

  const parseSkills = (val) =>
    val.split(',').map(s => s.trim()).filter(Boolean);

  const parseExperience = (val) => {
    const n = parseFloat(val.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const advanceStep = () => {
    const val = inputVal.trim();
    const lower = val.toLowerCase();

    switch (currentStep.key) {
      case 'role':
        if (!val) return; // required
        setConfig(c => ({ ...c, role: val }));
        break;
      case 'jd':
        if (!lower || lower === 'skip' || lower === 'no') {
          setConfig(c => ({ ...c, jdText: '' }));
        } else {
          setConfig(c => ({ ...c, jdText: val }));
        }
        break;
      case 'skills':
        if (!lower || lower === 'skip' || lower === 'none' || lower === 'no') {
          setConfig(c => ({ ...c, requiredSkills: [] }));
        } else {
          setConfig(c => ({ ...c, requiredSkills: parseSkills(val) }));
        }
        break;
      case 'experience':
        setConfig(c => ({ ...c, minExperience: parseExperience(val) }));
        break;
      default:
        break;
    }

    setInputVal('');
    setStep(s => s + 1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && currentStep.key !== 'jd') {
      e.preventDefault();
      advanceStep();
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}`,
        },
        body: JSON.stringify({
          role: config.role,
          jd_text: config.jdText || null,
          min_experience_years: config.minExperience,
          required_skills: config.requiredSkills,
          auto_shortlist_count: 5,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Pipeline failed');
      }
      const data = await res.json();
      if (mode === 'voice') {
        const summary = `Done! I screened ${data.total_screened} candidates for ${config.role}. Found ${data.stats.strong_fit} strong fits and ${data.stats.good_fit} good fits. Ready to show you the results.`;
        await voice.speakText(summary, 'wizard-done');
      }
      onComplete(data);
    } catch (err) {
      alert('Pipeline error: ' + err.message);
      setIsRunning(false);
    }
  };

  // â”€â”€ Form mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [formData, setFormData] = useState({ role: '', jdText: '', skills: '', minExp: '' });
  const [formRunning, setFormRunning] = useState(false);

  const handleFormRun = async () => {
    if (!formData.role.trim()) { alert('Please enter the role.'); return; }
    setFormRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}`,
        },
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
      onComplete(data);
    } catch (err) {
      alert('Pipeline error: ' + err.message);
      setFormRunning(false);
    }
  };

  // â”€â”€ Render: Mode selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const shellStyle = inline ? styles.inlineShell : styles.overlay;

  if (!mode) {
    return (
      <div style={shellStyle}>
        <div style={styles.card}>
          {!inline && <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={styles.iconCircle}><Zap size={28} style={{ color: '#8B5CF6' }} /></div>
            <h2 style={styles.title}>Screen candidates</h2>
            <p style={styles.subtitle}>
              I'll screen all <strong>{candidateCount}</strong> resume{candidateCount !== 1 ? 's' : ''} and find your best candidates automatically.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
            <button onClick={() => setMode('voice')} style={styles.primaryBtn}>
              <Mic size={18} /> Talk to AI Recruiter
              <span style={styles.tag}>Voice</span>
            </button>
            <button onClick={() => setMode('form')} style={styles.secondaryBtn}>
              <Edit2 size={16} /> Fill out a quick form
            </button>
          </div>
        </div>
      </div>
    );
  }

  // â”€â”€ Render: Form mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (mode === 'form') {
    return (
      <div style={shellStyle}>
        <div style={{ ...styles.card, maxWidth: 560 }}>
          {!inline && <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>}
          <div style={{ marginBottom: 20 }}>
            <div style={styles.iconCircle}><Zap size={22} style={{ color: '#8B5CF6' }} /></div>
            <h2 style={styles.title}>Screen candidates</h2>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Role you're hiring for *</label>
            <input style={styles.input} placeholder="e.g. Senior Backend Engineer"
              value={formData.role} onChange={e => setFormData(f => ({ ...f, role: e.target.value }))} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Job Description <span style={{ color: '#64748B' }}>(optional â€” paste for better ATS scoring)</span></label>
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

  // â”€â”€ Render: Voice mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const progressPct = ((step) / (STEPS.length - 1)) * 100;

  return (
    <div style={shellStyle}>
      <div style={{ ...styles.card, maxWidth: 520 }}>
        {!inline && <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>}

        {/* Progress bar */}
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
        </div>

        {/* Confirm / Run step */}
        {step === STEPS.length - 1 ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={styles.iconCircle}><Zap size={24} style={{ color: '#8B5CF6' }} /></div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Ready to screen {candidateCount} resumes</h3>
            <div style={styles.summaryBox}>
              <SummaryRow label="Role" value={config.role} />
              <SummaryRow label="JD" value={config.jdText ? `${config.jdText.slice(0, 60)}...` : 'Not provided'} />
              <SummaryRow label="Must-have skills" value={config.requiredSkills.length ? config.requiredSkills.join(', ') : 'None'} />
              <SummaryRow label="Min experience" value={config.minExperience > 0 ? `${config.minExperience} years` : 'Any'} />
            </div>
            <button onClick={handleRun} disabled={isRunning} style={{ ...styles.primaryBtn, width: '100%', marginTop: 16 }}>
              {isRunning
                ? <><Loader size={16} className="spin" /> Screening {candidateCount} resumes...</>
                : <><Zap size={16} /> Start screening</>}
            </button>
            <button onClick={() => setStep(0)} style={{ ...styles.ghostBtn, marginTop: 8 }}>Start over</button>
          </div>
        ) : (
          <>
            {/* AI question */}
            <div style={styles.aiMessage}>
              <div style={styles.aiAvatar}>AI</div>
              <div style={styles.aiBubble}>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{currentStep.question}</p>
                {aiSpeaking && <div style={styles.speakingDot} />}
              </div>
            </div>

            {/* User input */}
            <div style={styles.inputRow}>
              {currentStep.key === 'jd' ? (
                <textarea
                  ref={inputRef}
                  style={{ ...styles.input, flex: 1, height: 100, resize: 'vertical' }}
                  placeholder={currentStep.placeholder}
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                />
              ) : (
                <input
                  ref={inputRef}
                  style={{ ...styles.input, flex: 1 }}
                  placeholder={currentStep.placeholder}
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              )}

              {/* Voice button */}
              <button
                onMouseDown={voice.startRecording}
                onMouseUp={voice.stopRecording}
                onTouchStart={voice.startRecording}
                onTouchEnd={voice.stopRecording}
                style={{ ...styles.micBtn, background: voice.isRecording ? '#EF4444' : 'rgba(139,92,246,0.15)' }}
                title="Hold to speak"
              >
                {voice.isTranscribing ? <Loader size={16} className="spin" /> : voice.isRecording ? <MicOff size={16} style={{ color: '#fff' }} /> : <Mic size={16} style={{ color: '#8B5CF6' }} />}
              </button>
            </div>

            {voice.isRecording && (
              <p style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', margin: '4px 0 0' }}>Listening... release to stop</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              {step > 0
                ? <button onClick={() => { setStep(s => s - 1); setInputVal(''); }} style={styles.ghostBtn}>â† Back</button>
                : <div />}
              <button
                onClick={advanceStep}
                disabled={currentStep.key === 'role' && !inputVal.trim()}
                style={{ ...styles.primaryBtn, padding: '10px 24px', opacity: (currentStep.key === 'role' && !inputVal.trim()) ? 0.5 : 1 }}
              >
                {currentStep.key === 'experience' ? 'Review â†’' : 'Next'} <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
      <span style={{ color: '#94A3B8' }}>{label}</span>
      <span style={{ color: '#E2E8F0', maxWidth: '65%', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

const styles = {
  inlineShell: { display: 'flex', justifyContent: 'center', padding: '4px 0 24px' },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  card: {
    background: 'linear-gradient(135deg, #0F172A, #1E293B)',
    border: '1px solid rgba(139,92,246,0.25)',
    borderRadius: 20, padding: 32, width: '100%', maxWidth: 480,
    position: 'relative', boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8,
    padding: '6px 8px', cursor: 'pointer', color: '#94A3B8',
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
  },
  title: { fontSize: 22, fontWeight: 800, textAlign: 'center', marginBottom: 8, color: '#F1F5F9' },
  subtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 1.6 },
  primaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 20px',
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 20px',
    background: 'rgba(255,255,255,0.06)', color: '#CBD5E1',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  ghostBtn: {
    background: 'none', border: 'none', color: '#94A3B8',
    fontSize: 13, cursor: 'pointer', padding: '4px 8px',
  },
  tag: {
    marginLeft: 6, fontSize: 11, fontWeight: 700,
    background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 20,
  },
  progressTrack: {
    height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginBottom: 28,
  },
  progressFill: {
    height: '100%', background: 'linear-gradient(90deg,#8B5CF6,#3B82F6)',
    borderRadius: 2, transition: 'width 0.4s ease',
  },
  aiMessage: { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20 },
  aiAvatar: {
    flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
    background: 'linear-gradient(135deg,#8B5CF6,#3B82F6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 800, color: '#fff',
  },
  aiBubble: {
    background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)',
    borderRadius: '4px 14px 14px 14px', padding: '12px 16px', flex: 1,
  },
  speakingDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6',
    marginTop: 8, animation: 'pulse 1s infinite',
  },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
    padding: '11px 14px', color: '#F1F5F9', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  },
  micBtn: {
    flexShrink: 0, width: 42, height: 42, borderRadius: 10,
    border: '1px solid rgba(139,92,246,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background 0.2s',
  },
  summaryBox: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: '4px 16px', textAlign: 'left',
  },
  formGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 6 },
};

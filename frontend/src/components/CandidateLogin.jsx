import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, Loader, Shield, FileText, KeyRound } from 'lucide-react';

const DEMO_EMAIL = 'saipunithkolla@gmail.com';
const DEMO_SESSION = {
  email: DEMO_EMAIL,
  name: 'Sai Punith Kolla',
  candidate_id: 'demo-sample',
  has_interview: true,
  interview_config: {
    role: 'AI/ML Engineer',
    level: 'Mid-Level',
    num_questions: 8,
    focus_areas: ['Python', 'LLMs', 'Multi-Agent Systems', 'RAG', 'FastAPI'],
  },
  interview_completed: false,
  interview_report: null,
  is_demo: true,
  profile: {
    name: 'Sai Punith Kolla',
    predicted_role: 'AI/ML Engineer',
    experience_level: 'Mid-Level',
    total_experience_years: 3,
    location: 'Boston, MA',
    summary: 'AI/ML engineer with 3 years of experience building production-grade systems at Wipro Technologies and Northeastern University. Specializes in multi-agent AI platforms, NLP pipelines, RAG-based retrieval, and full-stack development with React and FastAPI.',
    skills: ['Python', 'PyTorch', 'TensorFlow', 'LangChain', 'FastAPI', 'React', 'RAG', 'NLP', 'Multi-Agent Systems', 'ChromaDB', 'AWS', 'Docker'],
    key_strengths: [
      'Multi-agent AI system design and orchestration',
      'LLM integration with RAG and vector search',
      'Full-stack AI application development',
    ],
    work_experience: [
      {
        title: 'Generative AI Product Development Fellow',
        company: 'Burnes Center for Social Change, Northeastern University',
        duration: 'Jan 2026 – Present',
      },
      {
        title: 'Python Developer L2 / IICS Developer',
        company: 'Wipro Technologies, Bengaluru, India',
        duration: 'Apr 2022 – Oct 2024',
      },
    ],
    education: [
      { degree: 'MS in Artificial Intelligence', institution: 'Northeastern University, Boston, MA', year: '2025–2027' },
      { degree: 'B.Tech in ECE', institution: 'VIT, India', year: '2018–2022' },
    ],
  },
};

const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs><linearGradient id="lg-cl" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#3B82F6"/><stop offset="100%" stopColor="#2563EB"/></linearGradient></defs>
    <rect width="32" height="32" rx="8" fill="url(#lg-cl)"/>
    <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#fff" strokeWidth="1.5" fill="none"/>
    <circle cx="16" cy="16" r="3" fill="#fff"/>
  </svg>
);

const API_BASE = import.meta.env.PROD ? 'https://resumate-api-74dm.onrender.com' : '';

export default function CandidateLogin() {
  const navigate = useNavigate();
  const { setCandidateSession } = useApp();

  const [step, setStep] = useState(1); // 1 = email, 2 = OTP
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Send OTP
  const handleSendOTP = async () => {
    if (!email.trim()) return;
    const trimmed = email.trim().toLowerCase();

    // Demo account bypass
    if (trimmed === DEMO_EMAIL) {
      localStorage.removeItem('resumate_interview_report');
      localStorage.setItem('resumate_candidate', JSON.stringify(DEMO_SESSION));
      setCandidateSession(DEMO_SESSION);
      setTimeout(() => navigate('/candidate/dashboard'), 300);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/candidate/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.detail || 'No access found for this email. Please contact your hiring manager.');
        return;
      }
      setStep(2);
    } catch {
      setError('Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async () => {
    if (!otp.trim() || otp.length < 6) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/candidate/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.detail || 'Invalid or expired code. Please try again.');
        return;
      }
      const { candidate_data, access_token } = data;
      if (access_token) {
        localStorage.setItem('resumate_candidate_token', access_token);
      }
      const session = {
        email: candidate_data.email,
        name: candidate_data.name,
        candidate_id: candidate_data.candidate_id,
        has_interview: candidate_data.has_interview,
        interview_config: candidate_data.interview_config,
        interview_completed: candidate_data.interview_completed,
        interview_report: candidate_data.interview_report,
        profile: candidate_data.profile,
      };
      localStorage.setItem('resumate_candidate', JSON.stringify(session));
      setCandidateSession(session);
      navigate('/candidate/dashboard');
    } catch {
      setError('Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAccess = () => {
    localStorage.removeItem('resumate_interview_report');
    localStorage.setItem('resumate_candidate', JSON.stringify(DEMO_SESSION));
    setCandidateSession(DEMO_SESSION);
    navigate('/candidate/dashboard');
  };

  return (
    <div className="candidate-login-page">
      <div className="cl-bg-gradient" />

      <nav className="cl-nav">
        <button className="cl-back" onClick={() => step === 2 ? setStep(1) : navigate('/')}>
          <ArrowLeft size={18} /> {step === 2 ? 'Back' : 'Back'}
        </button>
        <div className="cl-nav-logo"><Logo size={28} /> ResuMate AI</div>
      </nav>

      <div className="cl-container">
        <div className="cl-card">

          {step === 1 ? (
            <>
              <div className="cl-icon"><Mail size={32} /></div>
              <h1 className="cl-title">Candidate Portal</h1>
              <p className="cl-subtitle">Enter the email associated with your application to receive an access code.</p>

              <div className="cl-form">
                <div className="cl-input-wrap">
                  <Mail size={18} className="cl-input-icon" />
                  <input
                    type="email"
                    className="cl-input"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSendOTP(); }}
                    placeholder="Enter your email address"
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="cl-error">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <button className="cl-submit" onClick={handleSendOTP} disabled={!email.trim() || loading}>
                  {loading ? <Loader size={18} className="spin" /> : <ArrowRight size={18} />}
                  <span>{loading ? 'Sending code...' : 'Send Access Code'}</span>
                </button>
              </div>

              <div className="cl-divider"><span>or</span></div>

              <button className="cl-demo-btn" onClick={handleDemoAccess}>
                <FileText size={16} />
                <span>Try Sample Resume</span>
                <span className="cl-demo-badge">Demo</span>
              </button>

              <div className="cl-info">
                <Shield size={14} />
                <span>Your email must be registered by a hiring manager to access the portal.</span>
              </div>
            </>
          ) : (
            <>
              <div className="cl-icon"><KeyRound size={32} /></div>
              <h1 className="cl-title">Enter Access Code</h1>
              <p className="cl-subtitle">
                We sent a 6-digit code to <strong>{email}</strong>. It expires in 15 minutes.
              </p>

              <div className="cl-form">
                <div className="cl-input-wrap">
                  <KeyRound size={18} className="cl-input-icon" />
                  <input
                    type="text"
                    className="cl-input"
                    value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleVerifyOTP(); }}
                    placeholder="6-digit code"
                    maxLength={6}
                    disabled={loading}
                    style={{ letterSpacing: '6px', fontSize: '20px', textAlign: 'center' }}
                  />
                </div>

                {error && (
                  <div className="cl-error">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <button className="cl-submit" onClick={handleVerifyOTP} disabled={otp.length < 6 || loading}>
                  {loading ? <Loader size={18} className="spin" /> : <ArrowRight size={18} />}
                  <span>{loading ? 'Verifying...' : 'Verify Code'}</span>
                </button>

                <button
                  className="cl-demo-btn"
                  onClick={() => { setStep(1); setOtp(''); setError(''); }}
                  style={{ marginTop: '8px' }}
                >
                  <span>Use a different email</span>
                </button>
              </div>

              <div className="cl-info">
                <Shield size={14} />
                <span>Didn't receive a code? Check your spam folder or go back to resend.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

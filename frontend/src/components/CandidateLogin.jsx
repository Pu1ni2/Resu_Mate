import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, Loader, Shield, FileText } from 'lucide-react';

const DEMO_EMAIL = 'saipunithkolla@gmail.com';
const DEMO_SESSION = {
  email: DEMO_EMAIL,
  name: 'Sai Punith Kolla',
  candidate_id: 'demo-sample',
  has_interview: true,
  interview_config: {
    role: 'Software Engineer',
    level: 'Mid-Level',
    num_questions: 8,
  },
  interview_completed: false,
  interview_report: null,
  is_demo: true,
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
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim()) return;
    const trimmed = email.trim().toLowerCase();

    // Demo account — always works, no API needed
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
      const resp = await fetch(`${API_BASE}/api/chat/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed })
      });
      const data = await resp.json();

      if (data.access) {
        const session = {
          email: trimmed,
          name: data.name || '',
          candidate_id: data.candidate_id,
          has_interview: data.has_interview || false,
          interview_config: data.interview_config || null,
          interview_completed: data.interview_completed || false,
          interview_report: data.interview_report || null,
        };
        localStorage.setItem('resumate_candidate', JSON.stringify(session));
        setCandidateSession(session);
        setTimeout(() => navigate('/candidate/dashboard'), 300);
      } else {
        setError(data.message || 'No access found for this email. Please contact your recruiter.');
      }
    } catch (err) {
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
        <button className="cl-back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="cl-nav-logo"><Logo size={28} /> ResuMate AI</div>
      </nav>

      <div className="cl-container">
        <div className="cl-card">
          <div className="cl-icon"><Mail size={32} /></div>
          <h1 className="cl-title">Candidate Portal</h1>
          <p className="cl-subtitle">Enter the email associated with your application to access your dashboard.</p>

          <div className="cl-form">
            <div className="cl-input-wrap">
              <Mail size={18} className="cl-input-icon" />
              <input
                type="email"
                className="cl-input"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
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

            <button className="cl-submit" onClick={handleLogin} disabled={!email.trim() || loading}>
              {loading ? <Loader size={18} className="spin" /> : <ArrowRight size={18} />}
              <span>{loading ? 'Verifying...' : 'Access Dashboard'}</span>
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
        </div>
      </div>
    </div>
  );
}
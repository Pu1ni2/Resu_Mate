import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { API_BASE, responseError } from '../services/authFetch';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, Loader, Shield, KeyRound } from 'lucide-react';
import Logo from './ui/Logo';

export default function CandidateLogin() {
  const navigate = useNavigate();
  // Sent here because their sign-in expired (App.jsx).
  const expired = !!useLocation().state?.expired;
  const { setCandidateSession } = useApp();

  const [step, setStep] = useState(1); // 1 = email, 2 = OTP
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // A new code went out from the code step; the one before stopped working.
  const [resent, setResent] = useState(false);

  // Its saved copy is already gone (candidateFetch); forget it here too, so
  // the dashboard doesn't come back with it.
  useEffect(() => {
    if (expired) setCandidateSession(null);
  }, [expired, setCandidateSession]);

  // Step 1: Send OTP
  const handleSendOTP = async () => {
    if (!email.trim()) return;
    const trimmed = email.trim().toLowerCase();

    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/candidate/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!resp.ok) {
        setError(await responseError(resp, 'No access found for this email. Please contact your hiring manager.'));
        return;
      }
      setResent(step === 2);
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
      if (!resp.ok) {
        setError(await responseError(resp, 'Invalid or expired code. Please try again.'));
        return;
      }
      const { candidate_data, access_token } = await resp.json();
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

  return (
    <div className="candidate-login-page">
      <div className="cl-bg-gradient" />

      <nav className="cl-nav">
        <button className="cl-back" onClick={() => step === 2 ? setStep(1) : navigate('/')}>
          <ArrowLeft size={18} /> {step === 2 ? 'Back' : 'Back'}
        </button>
        <div className="cl-nav-logo"><Logo size={28} tone="candidate" /> ResuMate AI</div>
      </nav>

      <div className="cl-container">
        <div className="cl-card">

          {step === 1 ? (
            <>
              <div className="cl-icon"><Mail size={32} /></div>
              <h1 className="cl-title">Candidate Portal</h1>
              <p className="cl-subtitle">Enter the email associated with your application to receive an access code.</p>

              {expired && (
                <div role="status" className="cl-info" style={{ marginTop: 0, marginBottom: '16px', color: '#93C5FD' }}>
                  <Shield size={14} />
                  <span>Your sign-in has expired. Please sign in again.</span>
                </div>
              )}

              <div className="cl-form">
                <div className="cl-input-wrap">
                  <Mail size={18} className="cl-input-icon" />
                  <input
                    type="email"
                    className="cl-input"
                    aria-label="Email address"
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

              <div className="cl-info">
                <Shield size={14} />
                <span>Your email must be registered by a hiring manager to access the portal.</span>
              </div>
              {/* For people never invited, who can't sign in to delete their data. */}
              <p style={{ marginTop: '12px', fontSize: '12px', color: '#94A3B8', textAlign: 'center' }}>
                Not invited, but we hold your data? <Link to="/privacy/delete" style={{ color: '#93C5FD' }}>Ask us to delete it</Link>.
              </p>
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
                    aria-label="Access code"
                    value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); setResent(false); }}
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
                {resent && !error && (
                  <div role="status" className="cl-info" style={{ marginTop: 0, color: '#93C5FD' }}>
                    <Shield size={14} />
                    <span>We sent a new code. The one before no longer works.</span>
                  </div>
                )}

                <button className="cl-submit" onClick={handleVerifyOTP} disabled={otp.length < 6 || loading}>
                  {loading ? <Loader size={18} className="spin" /> : <ArrowRight size={18} />}
                  <span>{loading ? 'Verifying...' : 'Verify Code'}</span>
                </button>

                <button
                  className="cl-demo-btn"
                  onClick={() => { setOtp(''); handleSendOTP(); }}
                  disabled={loading}
                  style={{ marginTop: '8px' }}
                >
                  <span>Send a new code</span>
                </button>

                <button
                  className="cl-demo-btn"
                  onClick={() => { setStep(1); setOtp(''); setError(''); setResent(false); }}
                  style={{ marginTop: '8px' }}
                >
                  <span>Use a different email</span>
                </button>
              </div>

              <div className="cl-info">
                <Shield size={14} />
                <span>Didn't receive a code? Check your spam folder, or send a new one.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

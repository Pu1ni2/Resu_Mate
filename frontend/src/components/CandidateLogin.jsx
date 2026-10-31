import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

import { useApp } from '../context/AppContext';
import { API_BASE, responseError } from '../services/authFetch';
import AuthLayout, { FormHeading } from './auth/AuthLayout';
import { Field, CodeField, SubmitButton } from './auth/AuthFields';
import AuthNotice from './auth/AuthNotice';
import { SCREENS } from './auth/authStories';
import { emailError, codeError } from './auth/authChecks';

export default function CandidateLogin() {
  const navigate = useNavigate();
  // Sent here because their sign-in expired (App.jsx).
  const expired = !!useLocation().state?.expired;
  const { setCandidateSession } = useApp();

  const [step, setStep] = useState(1); // 1 = email, 2 = the code
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // A new code went out from the code step; the one before stopped working.
  const [resent, setResent] = useState(false);

  // Its saved copy is already gone (candidateFetch); forget it here too, so
  // the dashboard doesn't come back with it.
  useEffect(() => {
    if (expired) setCandidateSession(null);
  }, [expired, setCandidateSession]);

  const address = email.trim().toLowerCase();

  // Step 1, and "Send a new code" on step 2.
  const sendCode = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/candidate/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      });
      if (!resp.ok) {
        setError(await responseError(resp, 'We couldn’t send a code just now. Please try again in a moment.'));
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

  // Step 2.
  const verifyCode = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/candidate/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, code: otp }),
      });
      if (!resp.ok) {
        setError(await responseError(resp, 'This code is invalid or expired. Try again or request a new code.'));
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const found = step === 1 ? emailError(email) : codeError(otp);
    setFieldError(found);
    if (found) {
      setError('');
      document.getElementById(step === 1 ? 'candidate-email' : 'candidate-code')?.focus();
      return;
    }
    if (step === 1) sendCode();
    else verifyCode();
  };

  const differentEmail = () => {
    setStep(1);
    setOtp('');
    setFieldError('');
    setError('');
    setResent(false);
  };

  const problem = error || fieldError;
  const screen = step === 1 ? 'candidate' : 'code';
  const { form } = SCREENS[screen];

  return (
    <AuthLayout screen={screen}>
      {step === 1 ? (
        <>
          <FormHeading screen="candidate" focusKey={step} />
          {expired && !problem && <AuthNotice>Your sign-in has expired. Please sign in again.</AuthNotice>}
          {problem && <AuthNotice kind="error">{problem}</AuthNotice>}
          <form className="auth-form" noValidate aria-busy={loading} onSubmit={handleSubmit}>
            <div className="form-fields">
              <Field
                id="candidate-email" name="email" label="Email address" type="email" autoComplete="email"
                autoCapitalize="none" spellCheck={false} placeholder="you@example.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setFieldError(''); setError(''); }}
                error={fieldError} disabled={loading}
              />
              <p className="form-note">Your hiring manager needs to have registered this email before you can access the portal.</p>
            </div>
            <SubmitButton busy={loading} busyLabel={form.busy}>{form.submit}</SubmitButton>
          </form>
          {/* For people never invited, who can't sign in to delete their data. */}
          <p className="form-foot">Need your data removed? <Link className="text-link" to="/privacy/delete">Request deletion</Link></p>
        </>
      ) : (
        <>
          <FormHeading
            screen="code"
            focusKey={step}
            intro={(
              <>
                {form.intro} If <strong>{address}</strong> has been invited to an interview, we’ve emailed it a
                code. Nothing after a few minutes? Check the address, or ask your hiring manager.
              </>
            )}
          />
          {resent && !problem && <AuthNotice kind="success">If the address has been invited, a new code is on its way, and the one before no longer works.</AuthNotice>}
          {problem && <AuthNotice kind="error">{problem}</AuthNotice>}
          <form className="auth-form" noValidate aria-busy={loading} onSubmit={handleSubmit}>
            <div className="form-fields">
              <CodeField
                id="candidate-code" name="code" label="Access code" placeholder="000000"
                help="Enter all 6 digits. Codes expire after 15 minutes."
                value={otp} onCode={(code) => { setOtp(code); setFieldError(''); setError(''); setResent(false); }}
                error={fieldError} disabled={loading}
              />
            </div>
            <SubmitButton busy={loading} busyLabel={form.busy}>{form.submit}</SubmitButton>
            <div className="resend-actions">
              <span>Need another code?</span>
              <button type="button" className="text-link" onClick={() => { setOtp(''); sendCode(); }} disabled={loading}>
                Send a new code
              </button>
            </div>
          </form>
          <p className="form-foot">
            <button type="button" className="text-link" onClick={differentEmail}><span aria-hidden="true">←</span> Use a different email</button>
          </p>
        </>
      )}
    </AuthLayout>
  );
}

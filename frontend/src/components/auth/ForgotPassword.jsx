import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import api, { messageForApiError } from '../../services/api';
import AuthLayout, { FormHeading, SuccessPanel } from './AuthLayout';
import { Field, SubmitButton } from './AuthFields';
import AuthNotice from './AuthNotice';
import { SCREENS } from './authStories';
import { emailError } from './authChecks';

const { form } = SCREENS.forgot;

/* Ask for a link to choose a new password. There was no way back into an
 * account with a forgotten password. The server answers the same for every
 * address, so this page can't tell who has an account either. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFailure('');
    const found = emailError(email);
    setError(found);
    if (found) {
      document.getElementById('forgot-email')?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(res.data);
    } catch (err) {
      setFailure(messageForApiError(err, 'We couldn’t request a reset link. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout screen="forgot">
        <SuccessPanel
          screen="forgot"
          title="Check your inbox."
          action={<Link className="cta cta-primary full-width" to="/hiring/login">Back to sign in <span aria-hidden="true">→</span></Link>}
        >
          <p>{sent.message} The link works once, for 30 minutes. Check your spam folder if it doesn&apos;t arrive.</p>
          {/* Only from a development server without email. */}
          {sent.debug_reset_link && (
            <p><a className="text-link" href={sent.debug_reset_link}>Open the reset link (development)</a></p>
          )}
        </SuccessPanel>
      </AuthLayout>
    );
  }

  const problem = failure || error;
  return (
    <AuthLayout screen="forgot">
      <FormHeading screen="forgot" />
      {problem && <AuthNotice kind="error">{problem}</AuthNotice>}
      <form className="auth-form" noValidate aria-busy={loading} onSubmit={handleSubmit}>
        <div className="form-fields">
          <Field
            id="forgot-email" name="email" label="Email address" type="email" autoComplete="email"
            autoCapitalize="none" spellCheck={false} placeholder="you@company.com"
            value={email} onChange={(e) => { setEmail(e.target.value); setError(''); setFailure(''); }}
            error={error} disabled={loading}
          />
        </div>
        <SubmitButton busy={loading} busyLabel={form.busy}>{form.submit}</SubmitButton>
      </form>
      <p className="form-foot"><Link className="text-link" to="/hiring/login"><span aria-hidden="true">←</span> Back to sign in</Link></p>
    </AuthLayout>
  );
}

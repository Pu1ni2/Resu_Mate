import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api, { messageForApiError } from '../../services/api';
import AuthLayout, { FormHeading } from './AuthLayout';
import { PasswordField, SubmitButton } from './AuthFields';
import AuthNotice from './AuthNotice';
import { SCREENS } from './authStories';
import { newPasswordError, confirmError, errorSummary, firstError } from './authChecks';

const { form } = SCREENS.reset;

/* Choose a new password, from the link forgot-password emails. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);

  // Editing a field clears what was said about it.
  const edit = (name, set) => (e) => {
    set(e.target.value);
    setErrors(prev => ({ ...prev, [name]: '' }));
    setFailure('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;
    setFailure('');
    const found = { password: newPasswordError(password), confirm: confirmError(confirm, password) };
    setErrors(found);
    const first = firstError(found);
    if (first) {
      document.getElementById(`reset-${first}`)?.focus();
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/hiring/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      // A used or expired link says so, from the server.
      setFailure(messageForApiError(err, 'We couldn’t change your password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const problem = failure || errorSummary(errors);
  // Without the link from the email there is nothing to change: the form shows,
  // shut, with the way to a new link.
  const shut = loading || !token;

  return (
    <AuthLayout screen="reset">
      <FormHeading screen="reset" />
      {!token && (
        <AuthNotice>
          This page needs the link from your reset email. <Link className="text-link" to="/hiring/forgot">Request a reset link</Link>.
        </AuthNotice>
      )}
      {problem && <AuthNotice kind="error">{problem}</AuthNotice>}
      <form className="auth-form" noValidate aria-busy={loading} onSubmit={handleSubmit}>
        <div className="form-fields">
          <PasswordField
            id="reset-password" name="password" label="New password" autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password} onChange={edit('password', setPassword)} error={errors.password} disabled={shut}
          />
          <PasswordField
            id="reset-confirm" name="confirm" label="Confirm new password" autoComplete="new-password"
            placeholder="Enter it once more"
            value={confirm} onChange={edit('confirm', setConfirm)} error={errors.confirm} disabled={shut}
          />
        </div>
        <SubmitButton busy={loading} busyLabel={form.busy} disabled={!token}>{form.submit}</SubmitButton>
      </form>
      <p className="form-foot">Need another link? <Link className="text-link" to="/hiring/forgot">Request a new one</Link></p>
    </AuthLayout>
  );
}

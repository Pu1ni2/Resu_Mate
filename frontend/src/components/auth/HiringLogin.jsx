import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

import { useApp } from '../../context/AppContext';
import api, { messageForApiError } from '../../services/api';
import AuthLayout, { FormHeading } from './AuthLayout';
import { Field, PasswordField, SubmitButton } from './AuthFields';
import AuthNotice from './AuthNotice';
import { SCREENS } from './authStories';
import { emailError, passwordError, errorSummary, firstError } from './authChecks';

const { form } = SCREENS.login;
const WRONG = 'We couldn’t sign you in. Check your email and password, then try again.';

export default function HiringLogin() {
  const navigate = useNavigate();
  // Back from choosing a new password (ResetPassword).
  const passwordChanged = !!useLocation().state?.passwordChanged;
  const { loginHiringManager } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    setFailure('');
    const found = { email: emailError(email), password: passwordError(password) };
    setErrors(found);
    const first = firstError(found);
    if (first) {
      document.getElementById(`login-${first}`)?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { access_token, refresh_token, user } = res.data;
      loginHiringManager(access_token, refresh_token, user);
      navigate('/hiring');
    } catch (err) {
      // A wrong email or password is a 401; the rest say what they are.
      setFailure(err.response?.status === 401 ? WRONG : messageForApiError(err, WRONG));
    } finally {
      setLoading(false);
    }
  };

  const problem = failure || errorSummary(errors);

  return (
    <AuthLayout screen="login">
      <FormHeading screen="login" />
      {passwordChanged && !problem && <AuthNotice kind="success">Password changed. Sign in with the new one.</AuthNotice>}
      {problem && <AuthNotice kind="error">{problem}</AuthNotice>}
      <form className="auth-form" noValidate aria-busy={loading} onSubmit={handleSubmit}>
        <div className="form-fields">
          <Field
            id="login-email" name="email" label="Email address" type="email" autoComplete="email"
            autoCapitalize="none" spellCheck={false} placeholder="you@company.com"
            value={email} onChange={edit('email', setEmail)} error={errors.email} disabled={loading}
          />
          <PasswordField
            id="login-password" name="password" label="Password" autoComplete="current-password"
            placeholder="Your password"
            value={password} onChange={edit('password', setPassword)} error={errors.password} disabled={loading}
          />
          <div className="form-links"><Link className="text-link" to="/hiring/forgot">Forgot password?</Link></div>
        </div>
        <SubmitButton busy={loading} busyLabel={form.busy}>{form.submit}</SubmitButton>
      </form>
      <p className="form-foot">New here? <Link className="text-link" to="/hiring/register">Create an account</Link></p>
    </AuthLayout>
  );
}

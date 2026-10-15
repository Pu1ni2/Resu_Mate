import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { useApp } from '../../context/AppContext';
import api, { messageForApiError } from '../../services/api';
import AuthLayout, { FormHeading } from './AuthLayout';
import { Field, PasswordField, SubmitButton } from './AuthFields';
import AuthNotice from './AuthNotice';
import { SCREENS } from './authStories';
import {
  nameError, emailError, newPasswordError, confirmError, termsError, errorSummary, firstError,
} from './authChecks';

const { form: copy } = SCREENS.register;

export default function HiringRegister() {
  const navigate = useNavigate();
  const { loginHiringManager } = useApp();

  const [form, setForm] = useState({ name: '', email: '', company: '', password: '', confirm: '' });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);

  // Editing a field clears what was said about it.
  const settle = (name) => {
    setErrors(prev => ({ ...prev, [name]: '' }));
    setFailure('');
  };
  const update = name => (e) => {
    setForm(prev => ({ ...prev, [name]: e.target.value }));
    settle(name);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFailure('');
    // Every problem at once, in the order the fields appear, and the keyboard
    // on the first of them.
    const found = {
      name: nameError(form.name),
      email: emailError(form.email),
      password: newPasswordError(form.password),
      confirm: confirmError(form.confirm, form.password),
      terms: termsError(agreed),
    };
    setErrors(found);
    const first = firstError(found);
    if (first) {
      document.getElementById(`reg-${first}`)?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        company: form.company.trim() || undefined,
        // The server won't make an account without it, and records when.
        accept_terms: true,
      });
      const { access_token, refresh_token, user } = res.data;
      loginHiringManager(access_token, refresh_token, user);
      navigate('/hiring');
    } catch (err) {
      setFailure(messageForApiError(err, 'We couldn’t create your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const problem = failure || errorSummary(errors);

  return (
    <AuthLayout screen="register">
      <FormHeading screen="register" />
      {problem && <AuthNotice kind="error">{problem}</AuthNotice>}
      <form className="auth-form" noValidate aria-busy={loading} onSubmit={handleSubmit}>
        <div className="form-fields">
          <Field
            id="reg-name" name="name" label="Full name" autoComplete="name" placeholder="Your full name"
            value={form.name} onChange={update('name')} error={errors.name} disabled={loading}
          />
          <Field
            id="reg-email" name="email" label="Email address" type="email" autoComplete="email"
            autoCapitalize="none" spellCheck={false} placeholder="you@company.com"
            value={form.email} onChange={update('email')} error={errors.email} disabled={loading}
          />
          <Field
            id="reg-company" name="company" label="Company" optional autoComplete="organization" placeholder="Where you work"
            value={form.company} onChange={update('company')} disabled={loading}
          />
          <div className="field-row">
            <PasswordField
              id="reg-password" name="password" label="Password" autoComplete="new-password" placeholder="At least 8 characters"
              help="Use at least 8 characters."
              value={form.password} onChange={update('password')} error={errors.password} disabled={loading}
            />
            <PasswordField
              id="reg-confirm" name="confirm" label="Confirm password" autoComplete="new-password" placeholder="Enter it once more"
              value={form.confirm} onChange={update('confirm')} error={errors.confirm} disabled={loading}
            />
          </div>
          <div className="field-group consent-group">
            <label className="consent" htmlFor="reg-terms">
              <input
                className="consent-input" id="reg-terms" name="terms" type="checkbox" required
                checked={agreed} onChange={(e) => { setAgreed(e.target.checked); settle('terms'); }}
                aria-invalid={errors.terms ? 'true' : undefined}
                aria-describedby={errors.terms ? 'reg-terms-error' : undefined}
                disabled={loading}
              />
              {/* A new tab, so the half-filled form keeps its text. */}
              <span>
                I agree to the <a className="text-link" href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and
                {' '}<a className="text-link" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
              </span>
            </label>
            {errors.terms && <p className="field-error" id="reg-terms-error">{errors.terms}</p>}
          </div>
        </div>
        <SubmitButton busy={loading} busyLabel={copy.busy}>{copy.submit}</SubmitButton>
      </form>
      <p className="form-foot">Already have an account? <Link className="text-link" to="/hiring/login">Sign in</Link></p>
    </AuthLayout>
  );
}

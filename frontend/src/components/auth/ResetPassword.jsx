import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import api, { messageForApiError } from '../../services/api';
import AuthCard, { ErrorLine, iconStyle, inputStyle, labelStyle, linkStyle, submitStyle } from './AuthCard';

/* Choose a new password, from the link forgot-password emails. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/hiring/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(messageForApiError(err, 'Could not change the password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthCard title="Choose a new password">
        <ErrorLine>This page needs the link from the reset email.</ErrorLine>
        <p style={{ textAlign: 'center', fontSize: '13px' }}>
          <Link to="/hiring/forgot" style={linkStyle}>Ask for a reset link</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="At least 8 characters">
      {error && <ErrorLine>{error}</ErrorLine>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '14px' }}>
          <label htmlFor="reset-password" style={labelStyle}>New password</label>
          <div style={{ position: 'relative' }}>
            <Lock size={16} aria-hidden="true" style={iconStyle} />
            <input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              className="auth-field"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="reset-confirm" style={labelStyle}>Confirm new password</label>
          <div style={{ position: 'relative' }}>
            <Lock size={16} aria-hidden="true" style={iconStyle} />
            <input
              id="reset-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              className="auth-field"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
        </div>
        <button type="submit" disabled={loading} style={submitStyle(loading)}>
          {loading ? 'Saving...' : 'Change password'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--color-ink-muted)' }}>
        Link expired? <Link to="/hiring/forgot" style={linkStyle}>Ask for a new one</Link>
      </p>
    </AuthCard>
  );
}

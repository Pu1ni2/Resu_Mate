import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import api, { messageForApiError } from '../../services/api';
import AuthCard, { ErrorLine, NoticeLine, iconStyle, inputStyle, labelStyle, linkStyle, submitStyle } from './AuthCard';

/* Ask for a link to choose a new password. There was no way back into an
 * account with a forgotten password. The server answers the same for every
 * address, so this page can't tell who has an account either. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(res.data);
    } catch (err) {
      setError(messageForApiError(err, 'Could not send the link. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Forgot your password?" subtitle="We'll email you a link to choose a new one">
      {error && <ErrorLine>{error}</ErrorLine>}
      {sent ? (
        <>
          <NoticeLine>
            {sent.message} The link works once, for 30 minutes. Check your spam folder if it doesn't arrive.
          </NoticeLine>
          {/* Only from a development server without email. */}
          {sent.debug_reset_link && (
            <p style={{ fontSize: '13px', marginBottom: '16px' }}>
              <a href={sent.debug_reset_link} style={linkStyle}>Open the reset link (development)</a>
            </p>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="forgot-email" style={labelStyle}>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} aria-hidden="true" style={iconStyle} />
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                className="auth-field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                style={inputStyle}
              />
            </div>
          </div>
          <button type="submit" disabled={loading} style={submitStyle(loading)}>
            {loading ? 'Sending...' : 'Email me a link'}
          </button>
        </form>
      )}
      <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--color-ink-muted)' }}>
        <Link to="/hiring/login" style={linkStyle}>Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

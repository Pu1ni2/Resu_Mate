import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound } from 'lucide-react';
import api, { messageForApiError } from '../services/api';
import AuthCard, { ErrorLine, NoticeLine, iconStyle, inputStyle, labelStyle, linkStyle, submitStyle } from './auth/AuthCard';

/* Ask for everything held about you to be deleted. For anyone, including people
 * who were never invited: someone a sourcing run found, or whose résumé a
 * manager uploaded, never gets a portal sign-in to delete it from.
 *
 * An address, then the code it is emailed, then the deletion. The server's
 * answer is the same whether or not it holds anything, so neither is this. */
export default function RequestDeletion() {
  const [step, setStep] = useState('email'); // email | code | done
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const askForCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/privacy/erasure-code', { email: email.trim() });
      setSent(res.data);
      setStep('code');
    } catch (err) {
      setError(messageForApiError(err, 'Could not send the code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const erase = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/privacy/erase', { email: email.trim(), code: code.trim() });
      setStep('done');
    } catch (err) {
      setError(messageForApiError(err, 'Could not delete the data. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <AuthCard title="Your data is deleted">
        <NoticeLine>
          Everything ResuMate held about <strong>{email.trim()}</strong> is deleted: résumés, interviews,
          sign-ins and anything a search found.
        </NoticeLine>
        <p style={{ textAlign: 'center', fontSize: '13px' }}><Link to="/" style={linkStyle}>Back to ResuMate</Link></p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Delete your data" subtitle="Ask us to delete everything we hold about your email address">
      {error && <ErrorLine>{error}</ErrorLine>}
      {step === 'email' ? (
        <form onSubmit={askForCode}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="erasure-email" style={labelStyle}>Your email address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} aria-hidden="true" style={iconStyle} />
              <input id="erasure-email" type="email" autoComplete="email" className="auth-field" required
                value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <button type="submit" disabled={loading} style={submitStyle(loading)}>
            {loading ? 'Sending...' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={erase}>
          <NoticeLine>{sent?.message} The code works for 15 minutes.</NoticeLine>
          {/* Only from a development server without email. */}
          {sent?.debug_code && (
            <p style={{ fontSize: '13px', marginBottom: '12px' }}>Development code: <strong>{sent.debug_code}</strong></p>
          )}
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="erasure-code" style={labelStyle}>Code</label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} aria-hidden="true" style={iconStyle} />
              <input id="erasure-code" inputMode="numeric" autoComplete="one-time-code" className="auth-field" required
                maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
            </div>
          </div>
          <button type="submit" disabled={loading || code.length < 6} style={submitStyle(loading)}>
            {loading ? 'Deleting...' : 'Delete everything about me'}
          </button>
          <p style={{ textAlign: 'center', marginTop: '14px', fontSize: '13px' }}>
            <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }}
              style={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Use a different address
            </button>
          </p>
        </form>
      )}
      <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--color-ink-muted)' }}>
        This can't be undone. Hiring teams that invited you will no longer see your interview.
      </p>
    </AuthCard>
  );
}

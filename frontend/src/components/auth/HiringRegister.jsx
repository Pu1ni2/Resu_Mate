import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Building2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import api, { messageForApiError } from '../../services/api';

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px 10px 38px',
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-line)',
  borderRadius: '8px',
  color: 'var(--color-ink)',
  fontSize: '14px',
};

const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: 500,
  color: 'var(--color-ink-muted)', marginBottom: '6px',
};

export default function HiringRegister() {
  const navigate = useNavigate();
  const { loginHiringManager } = useApp();

  const [form, setForm] = useState({ name: '', email: '', company: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // In the order the fields appear. The name check used to run last, so
    // leaving it blank and mistyping the confirm reported the password instead
    // -- you fixed the password, submitted again, and only then learned about
    // the name.
    if (!form.name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        company: form.company.trim() || undefined,
      });
      const { access_token, refresh_token, user } = res.data;
      loginHiringManager(access_token, refresh_token, user);
      navigate('/hiring');
    } catch (err) {
      setError(messageForApiError(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-canvas)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px',
        background: 'var(--color-surface)', border: '1px solid var(--color-line)',
        borderRadius: '16px', padding: '40px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '48px', height: '48px',
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '22px',
          }} aria-hidden="true">🎯</div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-ink)', margin: '0 0 6px' }}>
            Create Account
          </h1>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '14px', margin: 0 }}>
            Set up your hiring manager account
          </p>
        </div>

        {error && (
          <div role="alert" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px', padding: '10px 14px',
            color: '#EF4444', fontSize: '13px', marginBottom: '16px',
          }}>
            <AlertCircle size={16} aria-hidden="true" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div style={{ marginBottom: '14px' }}>
            <label htmlFor="reg-name" style={labelStyle}>Full Name</label>
            <div style={{ position: 'relative' }}>
              <User size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)' }} />
              <input
                type="text"
                id="reg-name"
                name="name"
                autoComplete="name"
                className="auth-field"
                value={form.name}
                onChange={update('name')}
                placeholder="Jane Smith"
                required
                style={inputStyle}
              />
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label htmlFor="reg-email" style={labelStyle}>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)' }} />
              <input
                type="email"
                id="reg-email"
                name="email"
                autoComplete="email"
                className="auth-field"
                value={form.email}
                onChange={update('email')}
                placeholder="jane@company.com"
                required
                style={inputStyle}
              />
            </div>
          </div>

          {/* Company */}
          <div style={{ marginBottom: '14px' }}>
            <label htmlFor="reg-company" style={labelStyle}>Company (optional)</label>
            <div style={{ position: 'relative' }}>
              <Building2 size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)' }} />
              <input
                type="text"
                id="reg-company"
                name="company"
                autoComplete="organization"
                className="auth-field"
                value={form.company}
                onChange={update('company')}
                placeholder="Acme Inc."
                style={inputStyle}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: '14px' }}>
            <label htmlFor="reg-password" style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                id="reg-password"
                name="password"
                autoComplete="new-password"
                className="auth-field"
                value={form.password}
                onChange={update('password')}
                placeholder="Min 8 characters"
                required
                style={{ ...inputStyle, paddingRight: '38px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="auth-field"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-muted)', padding: 0 }}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="reg-confirm" style={labelStyle}>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)' }} />
              <input
                type="password"
                id="reg-confirm"
                name="confirm"
                autoComplete="new-password"
                className="auth-field"
                value={form.confirm}
                onChange={update('confirm')}
                placeholder="••••••••"
                required
                style={inputStyle}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px',
              background: loading ? 'var(--color-surface-raised)' : 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: loading ? 'var(--color-ink-muted)' : '#000',
              border: 'none', borderRadius: '8px', fontWeight: 600,
              fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--color-ink-muted)' }}>
          Already have an account?{' '}
          <Link to="/hiring/login" style={{ color: '#F59E0B', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

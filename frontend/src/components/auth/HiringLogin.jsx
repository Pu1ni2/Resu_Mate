import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import api from '../../services/api';

export default function HiringLogin() {
  const navigate = useNavigate();
  const { loginHiringManager } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { access_token, refresh_token, user } = res.data;
      loginHiringManager(access_token, refresh_token, user);
      navigate('/hiring');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-canvas)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
        borderRadius: '16px',
        padding: '40px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px', height: '48px',
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '22px',
          }} aria-hidden="true">
            🎯
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-ink)', margin: '0 0 6px' }}>
            Hiring Manager Login
          </h1>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: '14px', margin: 0 }}>
            Sign in to your ResuMate dashboard
          </p>
        </div>

        {error && (
          <div role="alert" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px', padding: '10px 14px',
            color: '#EF4444', fontSize: '13px', marginBottom: '20px',
          }}>
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="login-email" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-ink-muted)', marginBottom: '6px' }}>
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)' }} />
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                className="auth-field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px 10px 38px',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-line)',
                  borderRadius: '8px',
                  color: 'var(--color-ink)',
                  fontSize: '14px',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-ink-muted)', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)' }} />
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="auth-field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 38px 10px 38px',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-line)',
                  borderRadius: '8px',
                  color: 'var(--color-ink)',
                  fontSize: '14px',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="auth-field"
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-ink-muted)', padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px',
              background: loading ? 'var(--color-surface-raised)' : 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: loading ? 'var(--color-ink-muted)' : '#000',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--color-ink-muted)' }}>
          Don't have an account?{' '}
          <Link to="/hiring/register" style={{ color: '#F59E0B', textDecoration: 'none', fontWeight: 500 }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

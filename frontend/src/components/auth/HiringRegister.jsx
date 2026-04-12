import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Building2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import api from '../../services/api';

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
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        company: form.company || undefined,
      });
      const { access_token, refresh_token, user } = res.data;
      loginHiringManager(access_token, refresh_token, user);
      navigate('/hiring');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px 10px 38px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block', fontSize: '13px', fontWeight: 500,
    color: 'var(--text-secondary)', marginBottom: '6px',
  };

  const Field = ({ label, icon: Icon, type = 'text', field, placeholder, extra }) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <Icon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input type={type} value={form[field]} onChange={update(field)} placeholder={placeholder} style={inputStyle} />
        {extra}
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '40px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '48px', height: '48px',
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '22px',
          }}>🎯</div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Create Account
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Set up your hiring manager account
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px', padding: '10px 14px',
            color: '#EF4444', fontSize: '13px', marginBottom: '16px',
          }}>
            <AlertCircle size={16} />{error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Field label="Full Name" icon={User} field="name" placeholder="Jane Smith" />
          <Field label="Email" icon={Mail} type="email" field="email" placeholder="jane@company.com" />
          <Field label="Company (optional)" icon={Building2} field="company" placeholder="Acme Inc." />

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={update('password')}
                placeholder="Min 8 characters"
                style={{ ...inputStyle, paddingRight: '38px' }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="password"
                value={form.confirm}
                onChange={update('confirm')}
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px',
            background: loading ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #F59E0B, #D97706)',
            color: loading ? 'var(--text-secondary)' : '#000',
            border: 'none', borderRadius: '8px', fontWeight: 600,
            fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/hiring/login" style={{ color: '#F59E0B', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

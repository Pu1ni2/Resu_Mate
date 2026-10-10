import React from 'react';
import { AlertCircle } from 'lucide-react';

/* The frame the password pages share with sign-in and sign-up: the centred
 * card, the heading, and the error and notice lines. */

export const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px 10px 38px',
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-line)',
  borderRadius: '8px',
  color: 'var(--color-ink)',
  fontSize: '14px',
};

export const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: 500,
  color: 'var(--color-ink-muted)', marginBottom: '6px',
};

export const iconStyle = {
  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)',
};

export function submitStyle(busy) {
  return {
    width: '100%', padding: '11px',
    background: busy ? 'var(--color-surface-raised)' : 'linear-gradient(135deg, #F59E0B, #D97706)',
    color: busy ? 'var(--color-ink-muted)' : '#000',
    border: 'none', borderRadius: '8px', fontWeight: 600,
    fontSize: '14px', cursor: busy ? 'not-allowed' : 'pointer',
  };
}

export const linkStyle = { color: '#F59E0B', textDecoration: 'none', fontWeight: 500 };

export function ErrorLine({ children }) {
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: '8px', padding: '10px 14px',
      color: '#EF4444', fontSize: '13px', marginBottom: '16px',
    }}>
      <AlertCircle size={16} aria-hidden="true" />{children}
    </div>
  );
}

export function NoticeLine({ children }) {
  return (
    <div role="status" style={{
      background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
      borderRadius: '8px', padding: '10px 14px',
      color: 'var(--color-ink)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

export default function AuthCard({ title, subtitle, children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-canvas)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px',
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
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-ink)', margin: '0 0 6px' }}>{title}</h1>
          {subtitle && <p style={{ color: 'var(--color-ink-muted)', fontSize: '14px', margin: 0 }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

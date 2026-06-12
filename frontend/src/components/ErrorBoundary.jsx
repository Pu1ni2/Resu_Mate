import React from 'react';

/**
 * Top-level error boundary. Without this, any uncaught render error blanks the
 * whole app (white screen). This catches it and shows a recoverable fallback
 * so the user can reload or go home instead of staring at nothing.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong' };
  }

  componentDidCatch(error, info) {
    // Log for debugging; a real error-tracking hook (Sentry) would go here.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0B0B12', color: '#E4E4E7', padding: 24, textAlign: 'center',
      }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#A1A1AA', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            The page hit an unexpected error. Your data is safe — try reloading.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#3B82F6', color: '#fff', fontSize: 14, fontWeight: 600,
              }}
            >
              Reload
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                padding: '10px 22px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.08)', color: '#E4E4E7',
                border: '1px solid rgba(255,255,255,0.15)', fontSize: 14, fontWeight: 600,
              }}
            >
              Go home
            </button>
          </div>
          {import.meta.env.DEV && this.state.message && (
            <pre style={{
              marginTop: 20, padding: 12, background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
              color: '#FCA5A5', fontSize: 12, textAlign: 'left', overflowX: 'auto',
            }}>{this.state.message}</pre>
          )}
        </div>
      </div>
    );
  }
}

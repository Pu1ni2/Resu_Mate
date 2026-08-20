import React, { useState } from 'react';
import { Target, AlertTriangle, CheckCircle, Shield, Loader, ChevronRight } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { toast } from '../../services/notify';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

export default function ResumeIntelPanel({ focusCandidate }) {
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!focusCandidate?.id) return;
    setLoading(true);
    try {
      const resp = await authFetch(`${API_BASE}/api/chat/resume-intelligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: focusCandidate.id }),
      });
      if (!resp.ok) throw new Error('Analysis failed');
      const data = await resp.json();
      setIntel(data.intelligence);
    } catch (e) {
      toast('Resume intelligence failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!focusCandidate) return null;

  if (!intel && !loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '540px' }}>
        <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
          <Target size={32} style={{ color: '#8B5CF6', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Resume Intelligence</h3>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '16px' }}>
            AI-powered gap analysis, skill verification targets, and red flag detection
          </p>
          <button className="btn btn-primary" onClick={analyze} style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', padding: '10px 24px' }}>
            <Target size={15} /> <span>Analyze Resume</span>
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '540px' }}>
        <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
          <Loader size={24} className="spin" style={{ color: '#8B5CF6', marginBottom: '10px' }} />
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Analyzing resume for gaps and verification targets...</p>
        </div>
      </div>
    );
  }

  const severityColor = (s) => s === 'high' ? '#EF4444' : s === 'medium' ? '#F59E0B' : '#94A3B8';

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      {/* Confidence Score */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '12px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', fontWeight: '800', fontFamily: 'monospace', color: (intel.resume_confidence_score || 0) >= 70 ? '#22C55E' : (intel.resume_confidence_score || 0) >= 50 ? '#F59E0B' : '#EF4444' }}>
          {intel.resume_confidence_score || 0}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Resume Confidence Score</div>
      </div>

      {/* Gaps */}
      {(intel.gaps || []).length > 0 && (
        <div className="glass-card" style={{ padding: '16px', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} style={{ color: '#F59E0B' }} /> Gaps & Inconsistencies
          </h4>
          {intel.gaps.map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: i < intel.gaps.length - 1 ? '1px solid var(--surface-border, rgba(255,255,255,0.06))' : 'none' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: severityColor(g.severity), marginTop: '5px', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: severityColor(g.severity), textTransform: 'uppercase' }}>{g.type?.replace(/_/g, ' ')}</span>
                <p style={{ fontSize: '12px', color: 'var(--text2)', margin: '2px 0 0' }}>{g.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Verification Targets */}
      {(intel.verification_targets || []).length > 0 && (
        <div className="glass-card" style={{ padding: '16px', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Target size={14} style={{ color: '#8B5CF6' }} /> Interview Verification Targets
          </h4>
          {intel.verification_targets.map((t, i) => (
            <div key={i} style={{ padding: '8px 10px', marginBottom: '6px', borderRadius: '8px', background: 'var(--bg3, rgba(255,255,255,0.04))' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>{t.skill}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', margin: '2px 0' }}>Claim: {t.claim}</div>
              <div style={{ fontSize: '11px', color: '#8B5CF6', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ChevronRight size={10} /> {t.question_angle}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Strong Points */}
      {(intel.strong_points || []).length > 0 && (
        <div className="glass-card" style={{ padding: '16px', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={14} style={{ color: '#22C55E' }} /> Strong Points
          </h4>
          {intel.strong_points.map((s, i) => (
            <p key={i} style={{ fontSize: '12px', color: 'var(--text2)', padding: '3px 0', paddingLeft: '10px', borderLeft: '2px solid #22C55E30' }}>{s}</p>
          ))}
        </div>
      )}

      {/* Red Flags */}
      {(intel.red_flags || []).length > 0 && (
        <div className="glass-card" style={{ padding: '16px', borderColor: 'rgba(239,68,68,0.15)' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', color: '#EF4444' }}>
            <Shield size={14} /> Red Flags
          </h4>
          {intel.red_flags.map((f, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#EF4444', padding: '3px 0', opacity: 0.85 }}>{f}</p>
          ))}
        </div>
      )}

      <button onClick={() => setIntel(null)} style={{ marginTop: '12px', background: 'none', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>Re-analyze</button>
    </div>
  );
}

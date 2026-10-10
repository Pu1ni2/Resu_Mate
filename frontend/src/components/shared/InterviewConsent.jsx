import React from 'react';

/* What a candidate is told before an interview starts, and their say-so.
 * The server won't start one without it (backend/app/services/consent.py),
 * so both rooms keep their Start button off until it is ticked. */
export default function InterviewConsent({ video = false, checked, onChange }) {
  return (
    <div
      role="group"
      aria-labelledby="interview-consent-title"
      style={{
        textAlign: 'left', padding: '16px', marginBottom: '20px',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
      }}
    >
      <p id="interview-consent-title" style={{ fontSize: '13px', fontWeight: 600, color: '#E4E4E7', margin: '0 0 8px' }}>
        Before you start
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: '18px', fontSize: '13px', color: '#A1A1AA', lineHeight: 1.6 }}>
        <li>What you say is transcribed and saved.</li>
        <li>An AI interviewer asks the questions, and AI scores your answers. The hiring team sees your transcript, scores and report.</li>
        {video && <li>Your camera is used to check you stay in view. Looking away too often can end the interview.</li>}
      </ul>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#E4E4E7', cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        I understand and want to start.
      </label>
      <p style={{ fontSize: '12px', color: '#71717A', margin: '10px 0 0' }}>
        More in the{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#A1A1AA' }}>Privacy Policy</a>.
      </p>
    </div>
  );
}

import React from 'react';
import '../../styles/studio-interview.css';

/* What a candidate is told before an interview starts, and their say-so.
 * The server won't start one without it (backend/app/services/consent.py),
 * so both rooms keep their Start button off until it is ticked. */
export default function InterviewConsent({ video = false, checked, onChange }) {
  return (
    <div
      role="group"
      aria-labelledby="interview-consent-title"
      className="studio-interview-consent"
    >
      <p id="interview-consent-title">
        Before you start
      </p>
      <ul>
        <li>What you say is transcribed and saved.</li>
        <li>An AI interviewer asks the questions. When it ends, AI writes a report from your transcript, with a hiring recommendation. The hiring team sees your transcript and the report, and so can you.</li>
        {video && <li>Your camera is used to check you stay in view. Looking away too often can end the interview.</li>}
      </ul>
      <label>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        I understand and want to start.
      </label>
      <p className="si-privacy-note">
        More in the{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
      </p>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Video, Loader, Check, Mic } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { toast, notify } from '../../services/notify';

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

export default function InterviewCreator({ focusCandidate, selectedRole, selectedLevel, selectedExperience, scanContact }) {
  const [interviewEmail, setInterviewEmail] = useState('');
  const [interviewRole, setInterviewRole] = useState('');
  const [interviewNumQuestions, setInterviewNumQuestions] = useState('8');
  const [interviewFocusAreas, setInterviewFocusAreas] = useState('');
  // Interview format: "avatar" (LiveKit + lip-synced Simli face on camera) or
  // "conversational" (audio-only OpenAI Realtime via WebRTC — no video, no
  // avatar, lower latency). Defaults to avatar so existing flows are unchanged.
  const [interviewMode, setInterviewMode] = useState('avatar');
  const [interviewCreating, setInterviewCreating] = useState(false);
  const [interviewCreated, setInterviewCreated] = useState(false);

  useEffect(() => {
    if (scanContact?.email && !interviewEmail) {
      setInterviewEmail(scanContact.email);
    }
  }, [scanContact]);

  const createInterview = async () => {
    if (!focusCandidate || !interviewEmail.trim()) { toast('Please enter candidate email', 'error'); return; }
    setInterviewCreating(true);
    try {
      const resp = await authFetch(`${API_BASE}/api/chat/create-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: focusCandidate.id,
          candidate_email: interviewEmail.trim(),
          candidate_name: focusCandidate.name || '',
          role: interviewRole || selectedRole || focusCandidate.predicted_role || 'General',
          level: selectedLevel || focusCandidate.experience_level || 'Mid-Level',
          experience_required: selectedExperience || '',
          num_questions: parseInt(interviewNumQuestions) || 8,
          focus_areas: interviewFocusAreas ? interviewFocusAreas.split(',').map(s => s.trim()) : [],
          mode: interviewMode,
        }),
      });
      const data = await resp.json();
      if (data.message) {
        setInterviewCreated(true);
        toast('Interview created! Candidate can now login.', 'success');
        // The candidate takes the interview on their own time, so the result
        // arrives long after this screen is closed.
        notify(
          'Interview created',
          `${focusCandidate.name || interviewEmail.trim()} can now log in and start`,
          'success',
        );
      }
    } catch {
      toast('Failed to create interview', 'error');
    } finally {
      setInterviewCreating(false);
    }
  };

  if (interviewCreated) {
    return (
      <div style={{ padding: '20px', maxWidth: '640px' }}>
        <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
          <Check size={40} style={{ color: '#22C55E', marginBottom: '14px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Interview Created!</h3>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '4px' }}>Candidate can now login with:</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--info)', marginBottom: '12px' }}>{interviewEmail}</p>
          <p style={{ color: 'var(--text3)', fontSize: '13px' }}>
            {interviewRole || focusCandidate?.predicted_role || 'General'} · {interviewNumQuestions} questions · {interviewMode === 'conversational' ? 'Voice conversation' : 'Avatar interview'}
          </p>
          {interviewFocusAreas && <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '4px' }}>Focus: {interviewFocusAreas}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '640px' }}>
      <div className="glass-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '15px' }}>
          <Video size={18} /> Create AI Interview
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Interview format toggle — avatar (existing) vs conversational (new MVP).
              The cards use a solid --bg3 background rather than the translucent
              --surface token: nested inside .glass-card, a semi-transparent fill
              reads as see-through and the label becomes unreadable. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Interview Format</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setInterviewMode('avatar')}
                aria-pressed={interviewMode === 'avatar'}
                style={{
                  padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                  width: '100%', minWidth: 0, borderRadius: '10px',
                  fontFamily: 'inherit', color: 'var(--text)',
                  background: interviewMode === 'avatar' ? 'rgba(139,92,246,0.22)' : 'var(--bg3)',
                  border: `1px solid ${interviewMode === 'avatar' ? 'rgba(139,92,246,0.75)' : 'var(--surface-border)'}`,
                  display: 'flex', flexDirection: 'column', gap: '4px',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                  <Video size={14} /> Avatar interview
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.4, whiteSpace: 'normal' }}>Camera + lip-synced AI face. Slower but richer.</span>
              </button>
              <button
                type="button"
                onClick={() => setInterviewMode('conversational')}
                aria-pressed={interviewMode === 'conversational'}
                style={{
                  padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                  width: '100%', minWidth: 0, borderRadius: '10px',
                  fontFamily: 'inherit', color: 'var(--text)',
                  background: interviewMode === 'conversational' ? 'rgba(34,197,94,0.22)' : 'var(--bg3)',
                  border: `1px solid ${interviewMode === 'conversational' ? 'rgba(34,197,94,0.75)' : 'var(--surface-border)'}`,
                  display: 'flex', flexDirection: 'column', gap: '4px',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                  <Mic size={14} /> Voice conversation
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.4, whiteSpace: 'normal' }}>Audio-only, low-latency. No camera, no avatar.</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Candidate Email *</label>
            <input type="email" className="input" value={interviewEmail} onChange={e => setInterviewEmail(e.target.value)} placeholder="candidate@email.com" style={{ padding: '11px 14px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Role</label>
              <input type="text" className="input" value={interviewRole || selectedRole || focusCandidate?.predicted_role || ''} onChange={e => setInterviewRole(e.target.value)} placeholder="ML Engineer" style={{ padding: '11px 14px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Number of Questions</label>
              <select className="input" value={interviewNumQuestions} onChange={e => setInterviewNumQuestions(e.target.value)} style={{ padding: '11px 14px' }}>
                <option value="5">5 questions</option><option value="8">8 questions</option><option value="10">10 questions</option><option value="15">15 questions</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Focus Areas</label>
            <input type="text" className="input" value={interviewFocusAreas} onChange={e => setInterviewFocusAreas(e.target.value)} placeholder="System Design, Python, Leadership (comma-separated)" style={{ padding: '11px 14px' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button className="btn btn-primary" onClick={createInterview} disabled={!interviewEmail.trim() || interviewCreating} style={{ background: 'rgba(139,92,246,0.9)', padding: '12px 24px' }}>
              {interviewCreating ? <Loader size={16} className="spin" /> : <Video size={16} />}
              <span>{interviewCreating ? 'Creating...' : 'Create Interview & Grant Access'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

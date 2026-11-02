import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Loader, AlertCircle } from 'lucide-react';
import { API_BASE, authFetch, responseError } from '../../services/authFetch';
import InterviewReportView from '../shared/InterviewReportView';

const STATUS_LABELS = { pending: 'Waiting to be taken', in_progress: 'In progress', interrupted: 'Interrupted', completed: 'Completed' };
const KIND_LABELS = { conversational: 'Voice', avatar: 'Video' };
const day = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/* Every interview of the candidate, newest first, each finished one opening
 * its report here. Only the newest was shown anywhere: an earlier round's
 * report was out of reach once another was made. Styles in
 * studio-focus.css, under .sf-interview-history. */
export default function InterviewHistory({ candidateId }) {
  const [interviews, setInterviews] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await authFetch(`${API_BASE}/api/chat/candidates/${candidateId}/interviews`);
        if (!resp.ok) throw new Error(await responseError(resp, 'The interviews couldn’t be loaded.'));
        const data = await resp.json();
        if (!cancelled) setInterviews(data.interviews || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'The interviews couldn’t be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  if (open) {
    return (
      <div className="sf-interview-history">
        <button className="sf-button" onClick={() => setOpen(null)}><ArrowLeft size={16} /> All interviews</button>
        <InterviewReportView viewer="manager" report={open.report || {}} candidateId={candidateId}
          candidateEmail={open.email} interviewId={open.interview_id} />
      </div>
    );
  }

  return (
    <div className="sf-interview-history">
      {error ? (
        <div className="sf-notice" role="alert"><AlertCircle size={16} />{error}</div>
      ) : !interviews ? (
        <p role="status"><Loader className="spin" size={16} /> Loading interviews…</p>
      ) : interviews.length === 0 ? (
        <div className="sf-empty"><h3>No interviews yet.</h3><p>An interview made in Interview setup appears here, and stays once it’s done.</p></div>
      ) : (
        <ol aria-label="Interviews">
          {interviews.map(iv => (
            <li key={iv.interview_id}>
              <div>
                <strong>{iv.role || 'Interview'}</strong>
                <span>
                  {KIND_LABELS[iv.mode] || 'Interview'} · {STATUS_LABELS[iv.status] || iv.status}
                  {iv.completed_at ? ` · finished ${day(iv.completed_at)}` : iv.created_at ? ` · created ${day(iv.created_at)}` : ''}
                </span>
              </div>
              {iv.status === 'completed' && (
                <button className="sf-button" onClick={() => setOpen(iv)}>View report <ArrowUpRight size={16} /></button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowLeft, Loader, RefreshCw, MessageSquare } from 'lucide-react';

import { API_BASE, authFetch, responseError } from '../../services/authFetch';
import InterviewReportView from '../shared/InterviewReportView';
import ConversationSculpture from './ConversationSculpture';

const STATUS_LABELS = { pending: 'Invitation ready', in_progress: 'In progress', completed: 'Completed' };
const KIND_LABELS = { conversational: 'Voice interview', avatar: 'Avatar interview' };
const FILTERS = [['all', 'All interviews'], ['pending', 'Invitations'], ['in_progress', 'In progress'], ['completed', 'Completed']];

/* The dashboard's Interviews view (styles/studio-dashboard.css): the latest
 * interview for each candidate, from its invitation to its report, which
 * opens here. A failed load says so and offers another try, rather than
 * showing an empty history. With names hidden, each person is the name the
 * dashboard gives them, or "Candidate". */
export default function InterviewHub({ candidates = [], anonymize = false, getDisplayName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [report, setReport] = useState(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all(['interview-statuses', 'get-all-interview-results'].map(async (endpoint) => {
      const response = await authFetch(`${API_BASE}/api/chat/${endpoint}`);
      if (!response.ok) throw new Error(await responseError(response, 'Interviews could not be loaded.'));
      return response.json();
    }))
      .then(([statuses, results]) => {
        if (!cancelled) setData({ statuses: statuses.statuses || {}, results: results.results || [] });
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Interviews could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const reload = () => setRevision(r => r + 1);

  if (report) {
    return (
      <section>
        <button className="btn btn-secondary" style={{ marginBottom: 20 }} onClick={() => setReport(null)}>
          <ArrowLeft size={15} aria-hidden="true" />Back to interviews
        </button>
        <InterviewReportView viewer="manager" report={report.report || {}} candidateId={report.candidate_id} candidateEmail={report.email} />
      </section>
    );
  }

  const interviews = Object.entries(data?.statuses || {}).map(([email, interview]) => {
    const index = candidates.findIndex(c => [c.email, c.embedded_links?.email].some(e => typeof e === 'string' && e.toLowerCase() === email));
    const candidate = candidates[index];
    const result = data?.results.find(r => String(r.email || '').toLowerCase() === email);
    const name = anonymize
      ? (candidate && getDisplayName ? getDisplayName(candidate, index) : 'Candidate')
      : candidate?.name || result?.candidate_name || email;
    return { ...interview, email, candidate, result, name };
  });
  const visible = interviews.filter(row => filter === 'all' || row.status === filter);
  const count = status => (loading || error ? '—' : String(interviews.filter(r => r.status === status).length).padStart(2, '0'));

  return (
    <div className="sd-interviews">
      <section className="sd-interview-intro">
        <div>
          <span className="sw-eyebrow">SPACE TO BE HEARD</span>
          <h2>A résumé opens the door.<br /><em>A conversation tells you more.</em></h2>
          <p>Create an interview from a candidate’s evaluation. Review invitations and completed conversations here.</p>
          <Link className="btn btn-primary" to="/hiring/focus">Open a candidate file<ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
        <ConversationSculpture />
      </section>

      <div className="sd-interview-counts">
        {[['pending', 'Invitations'], ['in_progress', 'In progress'], ['completed', 'Completed']].map(([status, label]) => (
          <div key={status}><span>{label}</span><strong>{count(status)}</strong></div>
        ))}
      </div>

      <div className="sd-interview-toolbar">
        <div role="group" aria-label="Filter interviews">
          {FILTERS.map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <button className="btn btn-secondary" onClick={reload} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" />Refresh
        </button>
      </div>

      {loading ? (
        <p className="sd-loading" role="status"><Loader className="spin" size={18} aria-hidden="true" />Loading interviews…</p>
      ) : error ? (
        <div className="sd-error" role="alert">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={reload}>Try again</button>
        </div>
      ) : visible.length === 0 ? (
        <section className="sd-interview-empty">
          <MessageSquare size={27} aria-hidden="true" />
          <h3>{interviews.length ? 'No interviews in this view.' : 'Your next conversation starts here.'}</h3>
          <p>
            {interviews.length
              ? 'Choose another filter to see your interviews.'
              : 'Open a candidate file, evaluate their fit, and create their interview. Invitations will appear here.'}
          </p>
        </section>
      ) : (
        <div className="sd-interview-list">
          {visible.map((row, i) => (
            <article key={row.id || row.email} className="sd-interview-row">
              <span className="sd-interview-avatar" aria-hidden="true">{row.name[0]?.toUpperCase()}</span>
              <div className="sd-interview-person">
                <h3>{row.name}</h3>
                <p>{row.candidate?.predicted_role || row.result?.role || 'Candidate interview'}</p>
              </div>
              <span className={`sd-interview-status is-${row.status}`}><i aria-hidden="true" />{STATUS_LABELS[row.status] || row.status}</span>
              <span className="sd-interview-kind">{KIND_LABELS[row.mode] || 'Interview'}</span>
              {row.status === 'completed' && row.result ? (
                <button className="btn btn-secondary" onClick={() => setReport(row.result)}>
                  View report<ArrowUpRight size={14} aria-hidden="true" />
                </button>
              ) : row.candidate ? (
                <Link className="sd-row-link" to={`/hiring/focus?candidate=${row.candidate.id}`} aria-label={`Open candidate file for ${row.name}`}>
                  Candidate file<ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              ) : (
                <span className="sd-row-link">Interview #{row.id || i + 1}</span>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="sd-interview-footnote">
        Showing the latest interview for each candidate. An invitation does not confirm a scheduled meeting.
      </p>
    </div>
  );
}

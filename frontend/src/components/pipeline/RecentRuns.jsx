import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { API_BASE, authFetch } from '../../services/authFetch';
import { whenOf } from '../sourcer/RunHistory';

// The runs listed before "Show all".
const SHOWN = 5;

/* The screening runs this workspace keeps, newest first, under the brief, to
 * open again: a run lived only in the page, and leaving it meant screening
 * again. A list that can't be read shows nothing, as the brief works without
 * it. */
export default function RecentRuns({ onOpen }) {
  const [runs, setRuns] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch(`${API_BASE}/api/pipeline/runs`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && Array.isArray(data?.runs)) setRuns(data.runs); })
      .catch(() => { /* none listed */ });
    return () => { cancelled = true; };
  }, []);

  if (!runs.length) return null;
  const shown = showAll ? runs : runs.slice(0, SHOWN);
  return (
    <section className="ss-runs" aria-labelledby="ss-runs-title">
      <h3 id="ss-runs-title"><History size={14} aria-hidden="true" /> Earlier runs</h3>
      <ul>
        {shown.map(run => (
          <li key={run.run_id}>
            <button type="button" onClick={() => onOpen(run.run_id)}>
              <strong>{run.role}</strong>
              <span>{run.total_screened === 1 ? '1 screened' : `${run.total_screened} screened`} · {whenOf(run.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
      {!showAll && runs.length > SHOWN && (
        <button type="button" className="ss-runs-more" onClick={() => setShowAll(true)}>Show all {runs.length}</button>
      )}
    </section>
  );
}

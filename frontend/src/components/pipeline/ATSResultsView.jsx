import React, { useState, useEffect } from 'react';
import { XCircle, Zap, Users, ArrowLeft } from 'lucide-react';
import BatchActionConfirm from './BatchActionConfirm';
import RankedCandidates, { RankedSummary } from '../ranked/RankedCandidates';
import { fromAtsResult } from '../ranked/adapters';
import { cn } from '../ui/cn';
import { authFetch } from '../../services/authFetch';

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com')
  : '';

const TABS = ['All', 'Strong Fit', 'Good Fit', 'Consider', 'No Match'];

/* Bucket counts. Previously four tiles in four unrelated hues -- green, blue,
 * amber, red -- which read as a status legend rather than a distribution, and
 * spent four brand colours on what is one measure split into bands. The count
 * is the message, so it carries the weight; the label sits under it in muted
 * ink and only the leading bucket takes the accent. */
function BucketTile({ label, count, lead }) {
  return (
    <div className={cn(
      'rounded-[12px] border bg-surface px-4 py-3.5 text-center',
      lead ? 'border-accent-line' : 'border-line',
    )}>
      <div className={cn('font-mono text-[26px] font-semibold', lead ? 'text-accent' : 'text-ink')}>
        {count ?? 0}
      </div>
      <div className="mt-0.5 text-[12px] text-ink-subtle">{label}</div>
    </div>
  );
}

/* `embedded` drops the full-page shell so this can render inside the Screening
 * tab. It was written as a standalone takeover because the only thing that
 * could open it was the voice agent's full-screen overlay; now that Screening
 * is a section with its own nav entry, it has to sit in the workspace and
 * inherit the page background rather than paint its own.
 *
 * The palette here is still the hardcoded slate/violet set that exists nowhere
 * else in the app -- that gets replaced when this moves onto RankedCandidates. */
export default function ATSResultsView({ pipelineResult, onBack, onRunAgain, embedded = false }) {
  const [activeTab, setActiveTab] = useState('All');
  const [selectedIds, setSelectedIds] = useState(() =>
    (pipelineResult?.shortlist || []).map(r => r.candidate_id)
  );
  const [showBatchModal, setShowBatchModal] = useState(false);
  // Map of email -> { status, mode, id } for the small interview badge on each
  // candidate card. Fetched once on mount; failures are silent (badge just
  // doesn't render).
  const [interviewStatuses, setInterviewStatuses] = useState({});

  useEffect(() => {
    let cancelled = false;
    authFetch(`${API_BASE}/api/chat/interview-statuses`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data?.statuses) setInterviewStatuses(data.statuses); })
      .catch(() => { /* silent — badge just hides */ });
    return () => { cancelled = true; };
  }, []);

  if (!pipelineResult) return null;

  const { role, total_screened, stats, results = [], jd_requirements } = pipelineResult;

  // Default sort: highest ATS score first. The backend usually returns sorted
  // already, but a defensive sort here makes the UI behave even if it doesn't.
  const sortedResults = [...results].sort(
    (a, b) => (b?.ats_score ?? 0) - (a?.ats_score ?? 0)
  );
  const filtered = activeTab === 'All' ? sortedResults : sortedResults.filter(r => r.verdict === activeTab);

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(r => r.candidate_id));
    }
  };

  const selectedCandidates = results.filter(r => selectedIds.includes(r.candidate_id));

  // Adapt once, then decorate with interview state. The adapter is the only
  // place that knows the /pipeline/run payload shape.
  const rows = filtered.map(r => ({
    ...fromAtsResult(r),
    status: interviewStatuses[(r.email || '').toLowerCase()],
  }));

  const leadBucket = Math.max(stats?.strong_fit ?? 0, stats?.good_fit ?? 0, stats?.consider ?? 0, stats?.no_match ?? 0);

  return (
    <div className={embedded ? '' : 'min-h-screen bg-canvas px-5 py-6 text-ink'}>
      <div className={embedded ? '' : 'mx-auto max-w-[68rem]'}>

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-ink-muted transition-colors duration-[120ms] hover:bg-surface-hover hover:text-ink"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
              <Zap size={18} className="shrink-0 text-accent" />
              Shortlist <span className="text-ink-faint">—</span>{' '}
              <span className="truncate text-accent">{role}</span>
            </h1>
          </div>
          <button
            onClick={onRunAgain}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-accent px-4 py-2 text-[13px] font-medium text-ink-inverse transition-colors duration-[120ms] hover:bg-accent-hover"
          >
            <Zap size={14} /> Run again
          </button>
        </div>

        {/* Bucket counts */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <BucketTile label="Strong fit" count={stats?.strong_fit} lead={stats?.strong_fit === leadBucket} />
          <BucketTile label="Good fit"   count={stats?.good_fit}   lead={stats?.good_fit === leadBucket} />
          <BucketTile label="Consider"   count={stats?.consider}   lead={stats?.consider === leadBucket} />
          <BucketTile label="No match"   count={stats?.no_match}   lead={stats?.no_match === leadBucket} />
        </div>

        {/* What it screened against */}
        {jd_requirements?.required_skills?.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-surface px-4 py-2.5">
            <span className="text-[12px] font-medium text-ink-subtle">Screened against</span>
            {jd_requirements.required_skills.map((sk, i) => (
              <span key={i} className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted">{sk}</span>
            ))}
            {jd_requirements.min_experience_years > 0 && (
              <span className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted">
                {jd_requirements.min_experience_years}+ years
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map(tab => {
            const count = tab === 'All' ? results.length : results.filter(r => r.verdict === tab).length;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-[120ms]',
                  active
                    ? 'border-accent-line bg-accent-wash text-accent'
                    : 'border-line bg-surface text-ink-muted hover:text-ink',
                )}
              >
                {tab} <span className="font-mono opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Select all */}
        {rows.length > 0 && (
          <div className="mb-2.5 flex items-center justify-between">
            <button
              onClick={toggleAll}
              className="text-[13px] text-ink-muted transition-colors duration-[120ms] hover:text-ink"
            >
              {selectedIds.length === filtered.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-[12px] text-ink-subtle">{selectedIds.length} selected</span>
          </div>
        )}

        <RankedCandidates
          rows={rows}
          selectable
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          summary={
            <RankedSummary
              screened={total_screened}
              strongFits={stats?.strong_fit}
              elapsedMs={pipelineResult.elapsed_ms}
            />
          }
          emptyMessage="No candidates in this category."
        />

        {/* Sticky batch bar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-5 left-1/2 z-[100] flex max-w-[90vw] -translate-x-1/2 items-center gap-4 rounded-[16px] border border-accent-line bg-surface px-5 py-3.5 shadow-e3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-accent" />
              <span className="text-[14px] font-semibold text-ink">{selectedIds.length} selected</span>
            </div>
            <div className="h-6 w-px bg-line" />
            <button
              onClick={() => setShowBatchModal(true)}
              className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-medium text-ink-inverse transition-colors duration-[120ms] hover:bg-accent-hover"
            >
              <Zap size={14} /> Create interviews + draft emails
            </button>
            <button
              onClick={() => setSelectedIds([])}
              aria-label="Clear selection"
              className="p-1 text-ink-faint transition-colors duration-[120ms] hover:text-ink-muted"
            >
              <XCircle size={16} />
            </button>
          </div>
        )}
      </div>

      {showBatchModal && (
        <BatchActionConfirm
          selectedCandidates={selectedCandidates}
          role={role}
          onClose={() => setShowBatchModal(false)}
          onDone={() => { setShowBatchModal(false); setSelectedIds([]); }}
        />
      )}
    </div>
  );
}

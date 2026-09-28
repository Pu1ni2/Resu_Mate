import React from 'react';
import { cn } from '../ui/cn';
import Panel from './Panel';
import { formatCount } from './format';
import { filterComparisonOf } from './talentMapModel';

/* The page's argument in one panel: of everyone shortlisted, how many a title +
 * keyword filter would also have found, how many only reading everyone found,
 * and what made the filter miss them. */
function ReasonBar({ label, count, max, strong }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr_2.5rem] items-center gap-3 text-[12px]">
      <span className="truncate text-ink-muted">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-data-track" aria-hidden="true">
        <span className={cn('block h-full rounded-full', strong ? 'bg-ink' : 'bg-accent')}
          style={{ width: `${max ? Math.round((count / max) * 100) : 0}%` }} />
      </span>
      <span className="text-right font-mono text-ink-subtle">{formatCount(count)}</span>
    </div>
  );
}

function MethodTile({ label, value, note, accent }) {
  return (
    <div className={cn('rounded-[12px] border px-4 py-3', accent ? 'border-accent-line bg-accent-wash' : 'border-line bg-surface')}>
      <div className="text-[11px] font-medium text-ink-subtle">{label}</div>
      <div className={cn('mt-1 font-mono text-[26px] font-semibold leading-none', accent ? 'text-accent' : 'text-ink')}>{value}</div>
      <div className="mt-1 text-[11px] text-ink-subtle">{note}</div>
    </div>
  );
}

export default function FilterComparison({ state }) {
  const { byFilter, onlyByReading, reasons } = filterComparisonOf(state);
  const max = Math.max(byFilter, ...reasons.map(r => r.count));
  return (
    <Panel
      title="Shortlist so far · why filters would have missed them"
      meta={`${formatCount(state.counts.shortlisted)} shortlisted`}
    >
      <div className="grid gap-5 md:grid-cols-[1fr_minmax(0,16rem)]">
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-ink-subtle">Slipped through a filter because</div>
          {reasons.map(r => <ReasonBar key={r.key} label={r.label} count={r.count} max={max} />)}
          <ReasonBar label="matched the filter anyway" count={byFilter} max={max} strong />
        </div>
        <div>
          <div className="mb-2 text-[11px] font-medium text-ink-subtle">Same search, two methods</div>
          <div className="grid grid-cols-2 gap-2">
            <MethodTile label="Boolean + filters" value={formatCount(byFilter)} note="of the shortlist reachable" />
            <MethodTile label="Read everyone" value={`+${formatCount(onlyByReading)}`} note="only found by reading" accent />
          </div>
        </div>
      </div>
    </Panel>
  );
}

import React from 'react';
import { cn } from '../ui/cn';
import { formatCost, formatCount, formatElapsed } from './format';

/* The row of live figures across the top of the talent map. The first two are
 * the run's progress, so they take the inverted fill; shortlisted is the one
 * result that matters, so it takes the accent; the rest are context. */
function Tile({ label, value, of, strong, accent, progress }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[12px] border px-4 py-3',
        strong ? 'border-transparent bg-ink text-ink-inverse' : 'border-line bg-surface text-ink',
      )}
    >
      <div className={cn('text-[11px] font-medium', strong ? 'opacity-70' : 'text-ink-subtle')}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('font-mono text-[26px] font-semibold leading-none', accent && 'text-accent')}>{value}</span>
        {of != null && <span className="font-mono text-[12px] opacity-60">/ {of}</span>}
      </div>
      {progress != null && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-ink-inverse/15" aria-hidden="true">
          <div className="h-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function StatTiles({ counts, stats }) {
  const { found, judged, shortlisted } = counts;
  const tokens = (stats.tokens_in || 0) + (stats.tokens_out || 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Tile label="Screened" value={formatCount(judged)} of={formatCount(found)} strong
        progress={found ? judged / found : 0} />
      <Tile label="Judgements written" value={formatCount(judged)} strong />
      <Tile label="Shortlisted" value={formatCount(shortlisted)} accent />
      <Tile label="People / sec" value={Number(stats.per_sec || 0).toFixed(1)} />
      <Tile label="Elapsed" value={formatElapsed(stats.elapsed_s)} />
      <Tile label="Cost so far" value={formatCost(stats.cost_usd, tokens)} />
    </div>
  );
}

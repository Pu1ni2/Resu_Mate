import React, { memo } from 'react';
import { cn } from '../ui/cn';
import Panel from './Panel';
import { formatCount } from './format';
import { cellState } from './talentMapModel';

/* One cell per person in the search, in the order they were found, coloured by
 * how they landed. The point of the picture is the difference between the two
 * shortlisted colours: ink is someone a title + keyword filter would also have
 * found; accent is someone only reading everyone found. */
const CELL = {
  unread: 'bg-data-track',
  passed: 'bg-ink-faint/50',
  short_filter: 'bg-ink',
  short_reading: 'bg-accent',
};

const LEGEND = [
  ['unread', 'unread'],
  ['passed', 'read, passed on'],
  ['short_filter', 'shortlisted, a filter finds them too'],
  ['short_reading', 'shortlisted, only by reading'],
];

/* Memoised on the cell's state alone, so a judgement re-renders one cell rather
 * than every cell on the map. */
const Cell = memo(function Cell({ state }) {
  return <span className={cn('block aspect-square rounded-[2px] transition-colors duration-300', CELL[state])} />;
});

export default function PopulationMap({ state }) {
  const { order, people, counts } = state;
  return (
    <Panel
      title="Population map · everyone in this search"
      meta={order.length ? `${formatCount(counts.judged)} / ${formatCount(counts.found)} · one cell = one person` : null}
    >
      {order.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-subtle">Each person found becomes a cell here.</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10px,1fr))] gap-[3px]" aria-hidden="true" data-testid="population-map">
            {order.map(pid => (
              <Cell key={pid} state={cellState(people[pid])} />
            ))}
          </div>
          <p className="sr-only">
            {`Screened ${counts.judged} of ${counts.found}. Shortlisted ${counts.shortlisted}: `
              + `${counts.byFilter} a filter would find too, ${counts.shortlisted - counts.byFilter} only by reading.`}
          </p>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-subtle">
        {LEGEND.map(([key, label]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-block h-2.5 w-2.5 rounded-[2px]', CELL[key])} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="ml-auto">
          a title + keyword filter would show <span className="font-mono text-ink-muted">{formatCount(counts.filterWouldShow)}</span> of these
        </span>
      </div>
    </Panel>
  );
}

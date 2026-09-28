import React from 'react';
import Button from '../ui/Button';
import Avatar from './Avatar';
import Panel from './Panel';
import { shortlistOf } from './talentMapModel';

const CHIPS = 8;

/* "Priya Raman" -> "Priya R.": enough to recognise, short enough to fit a row. */
export function shortName(name) {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0].toUpperCase()}.` : first || 'Unknown';
}

/* The best people so far, as chips; any of them opens the full shortlist. */
export default function TopOfShortlist({ state, onOpen }) {
  const shortlist = shortlistOf(state).filter(p => p.status !== 'dismissed');
  const top = shortlist.slice(0, CHIPS);
  return (
    <Panel title="Top of shortlist" meta="ranked by written judgement">
      {top.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-subtle">No one has cleared the shortlist line yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {top.map(p => (
            <button
              key={p.pid}
              type="button"
              onClick={onOpen}
              title={`${p.name}: ${p.score}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised py-1 pl-1 pr-3 text-[12px] text-ink transition-colors duration-[120ms] hover:border-line-strong"
            >
              <Avatar person={p} size={22} className="rounded-full" />
              {shortName(p.name)}
              <span className="font-mono text-ink-subtle">{p.score}</span>
            </button>
          ))}
          <Button size="sm" variant="accentGhost" onClick={onOpen}>See all {shortlist.length}</Button>
        </div>
      )}
    </Panel>
  );
}

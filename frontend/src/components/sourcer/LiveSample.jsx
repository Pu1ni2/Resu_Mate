import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../ui/cn';
import Avatar from './Avatar';
import Panel from './Panel';
import { formatCount } from './format';

/* The people most recently read, newest first, with a mark for how each landed.
 * The one being judged now is ringed. */
export default function LiveSample({ state }) {
  const { sample, people, current, counts } = state;
  return (
    <Panel
      title="Reading · live sample"
      meta={sample.length ? `${sample.length} of the last ${formatCount(counts.judged)} read` : null}
    >
      {sample.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-subtle">People appear here as they are read.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1.5">
          {sample.map(pid => {
            const p = people[pid];
            const shortlisted = p.verdict === 'shortlist';
            return (
              <li key={pid} title={`${p.name}: ${shortlisted ? 'shortlisted' : 'passed on'}`} className="relative">
                <Avatar
                  person={p}
                  size={36}
                  className={cn(!shortlisted && 'opacity-60', pid === current && 'ring-2 ring-accent')}
                />
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border border-surface',
                    shortlisted ? 'bg-accent text-ink-inverse' : 'bg-surface-raised',
                  )}
                  aria-hidden="true"
                >
                  {shortlisted ? <Check size={9} strokeWidth={3} /> : <span className="h-1 w-1 rounded-full bg-ink-faint" />}
                </span>
                <span className="sr-only">{`${p.name}: ${shortlisted ? 'shortlisted' : 'passed on'}`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

import React from 'react';
import { cn } from '../ui/cn';
import Panel from './Panel';
import { formatCount } from './format';

/* Every judgement as it is written, newest first: who, how they landed, and the
 * one line of reasoning. The # is their place in the search, matching the map. */
export default function LiveLog({ state }) {
  const { log, people, order } = state;
  const position = Object.fromEntries(order.map((pid, i) => [pid, i + 1]));
  return (
    <Panel title="Live judgements" meta={log.length ? `latest ${log.length}` : null} bodyClassName="px-0 pb-2">
      {log.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-ink-subtle">Judgements are listed here as they are written.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="sr-only">
              <tr><th>#</th><th>Name</th><th>Verdict</th><th>Judgement</th></tr>
            </thead>
            <tbody>
              {log.map(pid => {
                const p = people[pid];
                const shortlisted = p.verdict === 'shortlist';
                return (
                  <tr key={pid} className="border-t border-line first:border-t-0">
                    <td className="w-14 py-1.5 pl-4 font-mono text-ink-faint">{formatCount(position[pid])}</td>
                    <td className="w-40 max-w-40 truncate py-1.5 pr-3 font-medium text-ink">{p.name}</td>
                    <td className={cn('w-24 py-1.5 pr-3 text-[11px] font-semibold', shortlisted ? 'text-accent' : 'text-ink-faint')}>
                      {shortlisted ? 'Shortlist' : 'Passed on'}
                    </td>
                    <td className="max-w-0 truncate py-1.5 pr-4 text-ink-muted" title={p.judgement}>{p.judgement}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

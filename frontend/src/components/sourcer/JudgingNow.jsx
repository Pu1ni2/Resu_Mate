import React from 'react';
import { ExternalLink } from 'lucide-react';
import Badge from '../ui/Badge';
import { cn } from '../ui/cn';
import Avatar from './Avatar';
import Panel from './Panel';
import { formatCount } from './format';

/* How full each level's bar is. The level is also written out beside it, so
 * the bar is never the only way to read it. */
const LEVEL = {
  strong: { pct: 100, word: 'strong' },
  partial: { pct: 60, word: 'partial' },
  weak: { pct: 30, word: 'weak' },
  none: { pct: 0, word: 'none' },
  unknown: { pct: 0, word: 'not shown' },
};

const SOURCE = { upload: 'Your upload', github: 'GitHub', web: 'Web profile' };

/* Profile links come from the open web; only ever link to http(s). */
export function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? url : null;
}

export default function JudgingNow({ state }) {
  const person = state.current ? state.people[state.current] : null;
  const criteria = state.plan?.criteria || [];
  const answers = Object.fromEntries((person?.criteria || []).map(a => [a.id, a]));
  const href = safeUrl(person?.url);

  return (
    <Panel
      title="Judging now"
      meta={person ? `${formatCount(person.ms)} ms · ${formatCount(person.tokens)} tokens` : null}
    >
      {!person ? (
        <p className="py-10 text-center text-[13px] text-ink-subtle">The person being read appears here.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[112px_1fr]">
          <div>
            <Avatar person={person} size={112} className="rounded-[12px]" />
            <div className="mt-2 text-[15px] font-semibold text-ink">{person.name}</div>
            <div className="text-[12px] text-ink-subtle">{SOURCE[person.source] || person.source}</div>
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
              >
                View profile <ExternalLink size={11} />
              </a>
            )}
          </div>

          <div className="min-w-0">
            {person.headline && <p className="mb-3 truncate text-[13px] text-ink-muted">{person.headline}</p>}
            <dl className="m-0 space-y-1.5">
              {criteria.map(c => {
                const a = answers[c.id] || { level: 'unknown', value: '' };
                const level = LEVEL[a.level] || LEVEL.unknown;
                const missedMust = c.kind === 'must' && a.level === 'none';
                return (
                  <div key={c.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_7rem] items-center gap-3 text-[12px]">
                    <dt className="truncate text-ink-subtle" title={c.label}>
                      {c.label}{c.kind === 'must' && <span className="text-ink-faint"> · must</span>}
                    </dt>
                    <dd className="m-0 truncate text-ink" title={a.value}>{a.value || '-'}</dd>
                    <dd className="m-0 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-data-track" aria-hidden="true">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${level.pct}%` }} />
                      </span>
                      <span className={cn('w-14 shrink-0 whitespace-nowrap text-right text-[11px]', missedMust ? 'text-critical' : 'text-ink-faint')}>
                        {level.word}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>

            <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{person.judgement}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={person.verdict === 'shortlist' ? 'accent' : 'neutral'} size="sm">
                {person.verdict === 'shortlist' ? 'Shortlist' : 'Passed on'}
              </Badge>
              <span className="font-mono text-[12px] text-ink-subtle">score {person.score}</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

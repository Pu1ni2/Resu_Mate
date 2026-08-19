import React from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '../ui/cn';

/* ProductMock — the AutoHire results panel, rendered in real HTML.
 *
 * Built rather than screenshotted, for four reasons: it stays crisp at any DPI,
 * it reflows on small screens instead of overflowing, it follows the theme
 * tokens into light mode, and it cannot go stale the way a PNG of a UI does.
 *
 * It is an honest depiction, not a fantasy. The score bands and verdict labels
 * are the ones ats_service.py actually assigns (>=75 Strong Fit, >=55 Good Fit,
 * >=35 Consider), and the layout mirrors what ATSResultsView.jsx renders: a
 * conic-gradient score ring, name, verdict pill, meta line, sub-score bars.
 * Candidate names are illustrative.
 */

const ROWS = [
  {
    score: 92,
    name: 'Maya Rodriguez',
    meta: 'Senior · 6y · Berlin',
    verdict: 'Strong Fit',
    skills: 94,
    matched: ['Python', 'FastAPI', 'AWS'],
    lead: true,
  },
  {
    score: 87,
    name: 'Devan Patel',
    meta: 'Mid-Level · 4y · Austin',
    verdict: 'Strong Fit',
    skills: 88,
    matched: ['Python', 'Django', 'Postgres'],
  },
  {
    score: 64,
    name: 'Sam Okafor',
    meta: 'Mid-Level · 3y · Remote',
    verdict: 'Good Fit',
    skills: 61,
    matched: ['Python', 'Flask'],
  },
];

/* Same construction as the live view: a conic sweep for the filled arc with a
 * punched-out centre, so the number sits in a ring rather than on a pie. */
function ScoreRing({ score }) {
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--color-accent) ${score * 3.6}deg, var(--color-data-track) 0deg)`,
      }}
    >
      <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-surface font-mono text-[13px] font-semibold text-ink">
        {score}
      </div>
    </div>
  );
}

export default function ProductMock({ className }) {
  return (
    <div
      className={cn('relative w-full', className)}
      /* Decorative: the page already says all of this in prose above. */
      aria-hidden="true"
    >
      <div className="relative overflow-hidden rounded-[16px] border border-line bg-surface shadow-e3 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,var(--color-highlight)_18%,var(--color-highlight-strong)_50%,var(--color-highlight)_82%,transparent)]">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-line bg-surface-raised/60 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-ink-faint/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-faint/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-faint/50" />
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-muted">
            <Sparkles size={13} className="shrink-0 text-accent" />
            <span className="truncate">
              AutoHire <span className="text-ink-faint">·</span> Python Developer
            </span>
          </div>
          <ChevronDown size={14} className="ml-auto shrink-0 text-ink-faint" />
        </div>

        {/* Summary strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-[12px] text-ink-subtle sm:px-5">
          <span>
            <span className="font-mono text-ink-muted">12</span> resumes screened
          </span>
          <span>
            <span className="font-mono text-ink-muted">4</span> strong fits
          </span>
          <span className="ml-auto hidden items-center gap-1.5 text-positive sm:flex">
            <Check size={12} /> Ranked in 8s
          </span>
        </div>

        {/* Ranked rows */}
        <div className="divide-y divide-line">
          {ROWS.map(row => (
            <div
              key={row.name}
              className={cn(
                'flex items-center gap-3.5 px-4 py-3.5 sm:gap-4 sm:px-5',
                // The top result carries a faint accent wash and a left rule --
                // the same "this is the one" treatment the real list uses,
                // shown here in its resting state rather than on hover.
                row.lead && 'relative bg-accent-wash/40 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent',
              )}
            >
              <ScoreRing score={row.score} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-ink">{row.name}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      row.verdict === 'Strong Fit'
                        ? 'border-positive/30 bg-positive-wash text-positive'
                        : 'border-line bg-surface-raised text-ink-muted',
                    )}
                  >
                    {row.verdict}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[12px] text-ink-subtle">{row.meta}</div>

                {/* Skill-match bar. Scaled to the value, with the track always
                    visible, so the length means something -- unlike the current
                    analytics bars, which render full-width regardless. */}
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-data-track">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${row.skills}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-ink-subtle">
                    {row.skills}% skills
                  </span>
                </div>
              </div>

              <div className="hidden shrink-0 gap-1.5 lg:flex">
                {row.matched.map(s => (
                  <span
                    key={s}
                    className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fades the panel into the page instead of stopping at a hard edge. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--color-canvas))' }}
      />
    </div>
  );
}

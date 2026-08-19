import React from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '../ui/cn';
import RankedCandidates, { RankedSummary } from '../ranked/RankedCandidates';
import { fromAtsResult } from '../ranked/adapters';

/* ProductMock — the AutoHire results panel, rendered in real HTML.
 *
 * Built rather than screenshotted, for four reasons: it stays crisp at any DPI,
 * it reflows on small screens instead of overflowing, it follows the theme
 * tokens into light mode, and it cannot go stale the way a PNG of a UI does.
 *
 * Crucially it renders through the same RankedCandidates component the product
 * uses, from payloads in the same shape the API returns. That is what stops the
 * marketing panel and the real screen drifting apart -- restyle the product and
 * this follows automatically. Only the window chrome and the sample rows are
 * specific to the landing page.
 *
 * Candidate names are illustrative; the scores, verdicts and bands are the ones
 * ats_service.py actually produces.
 */

/* Shaped exactly like a /api/pipeline/run result so it goes through the real
 * adapter — no parallel mock format to keep in sync. */
const SAMPLE = [
  {
    candidate_id: 1,
    name: 'Maya Rodriguez',
    ats_score: 92,
    verdict: 'Strong Fit',
    predicted_role: 'Senior',
    total_experience_years: 6,
    location: 'Berlin',
    skills_match: 94,
    matched_skills: ['Python', 'FastAPI', 'AWS'],
  },
  {
    candidate_id: 2,
    name: 'Devan Patel',
    ats_score: 87,
    verdict: 'Strong Fit',
    predicted_role: 'Mid-Level',
    total_experience_years: 4,
    location: 'Austin',
    skills_match: 88,
    matched_skills: ['Python', 'Django', 'Postgres'],
  },
  {
    candidate_id: 3,
    name: 'Sam Okafor',
    ats_score: 64,
    verdict: 'Good Fit',
    predicted_role: 'Mid-Level',
    total_experience_years: 3,
    location: 'Remote',
    skills_match: 61,
    matched_skills: ['Python', 'Flask'],
  },
];

const ROWS = SAMPLE.map(fromAtsResult);

export default function ProductMock({ className }) {
  return (
    <div
      className={cn('relative w-full', className)}
      /* Decorative: the prose above already says all of this. */
      aria-hidden="true"
    >
      <div className="relative overflow-hidden rounded-[16px] border border-line bg-surface shadow-e3 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,var(--color-highlight)_18%,var(--color-highlight-strong)_50%,var(--color-highlight)_82%,transparent)]">
        {/* Window chrome — a marketing device, not part of the real screen. */}
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

        <RankedSummary screened={12} strongFits={4} elapsedMs={8200} />

        {/* Same component the product renders. No selection or expand here --
            there is nothing to act on in a picture. */}
        <RankedCandidates
          rows={ROWS}
          expandable={false}
          className="rounded-none border-0 bg-transparent shadow-none"
        />
      </div>

      {/* Fades the panel into the page instead of stopping at a hard edge. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--color-canvas))' }}
      />
    </div>
  );
}

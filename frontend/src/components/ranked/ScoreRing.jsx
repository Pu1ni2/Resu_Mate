import React from 'react';
import { cn } from '../ui/cn';

/* ScoreRing — a 0-100 fit score as a filled arc.
 *
 * Extracted so the landing mock and the three in-app ranked surfaces render
 * the identical mark. They previously each built their own, which is how the
 * app ended up with two different ring sizes and two different colour maps for
 * the same four verdicts.
 *
 * A conic sweep with a punched-out centre, rather than an SVG circle: no
 * viewBox maths, and the track and fill stay pixel-aligned at any size.
 *
 * The arc is one hue at varying fill, not a red-amber-green scale. Magnitude is
 * sequential data -- the length already encodes "how much", so re-encoding it
 * in hue adds nothing and spends colours that mean something elsewhere. The
 * verdict pill beside it carries the judgement.
 */

const SIZES = {
  sm: { outer: 'h-10 w-10', inner: 'h-[30px] w-[30px]', text: 'text-[11px]' },
  md: { outer: 'h-12 w-12', inner: 'h-[38px] w-[38px]', text: 'text-[13px]' },
  lg: { outer: 'h-14 w-14', inner: 'h-[44px] w-[44px]', text: 'text-[15px]' },
};

export default function ScoreRing({ score, size = 'md', className }) {
  // Guard the arc maths: a missing or out-of-range score should render an empty
  // ring, never a wrapped sweep.
  const safe = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0;
  const s = SIZES[size] || SIZES.md;

  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center rounded-full', s.outer, className)}
      style={{
        background: `conic-gradient(var(--color-accent) ${safe * 3.6}deg, var(--color-data-track) 0deg)`,
      }}
      role="img"
      aria-label={`Fit score ${safe} out of 100`}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-surface font-mono font-semibold text-ink',
          s.inner,
          s.text,
        )}
      >
        {safe}
      </div>
    </div>
  );
}

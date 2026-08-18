import React from 'react';
import { cn } from './cn';

/* Badge / Chip — replaces .badge, .badge-orange/-green/-blue/-purple/-pink
 * and the .skill chip.
 *
 * The old set offered five brand hues, which is how candidate cards ended up
 * with orange, green, blue, purple and pink pills side by side and no
 * consistent meaning attached to any of them. Tones here are semantic and
 * few: neutral by default, accent for emphasis, and three status tones that
 * mean something.
 *
 * Also drops the uppercase + letter-spacing treatment. Small caps text is
 * harder to scan and made every badge shout equally.
 */

const tones = {
  neutral: 'bg-surface-raised text-ink-muted border-line',
  accent: 'bg-accent-wash text-accent border-accent-line',
  positive: 'bg-positive-wash text-positive border-positive/30',
  caution: 'bg-caution-wash text-caution border-caution/30',
  critical: 'bg-critical-wash text-critical border-critical/30',
};

/* The old palette survives in candidate data (badges carry a `color` string),
 * so map the hue names onto tones rather than reintroducing five hues. Blue
 * and purple both collapse to neutral — they never encoded a distinct meaning.
 */
const legacyColorToTone = {
  orange: 'accent',
  green: 'positive',
  red: 'critical',
  blue: 'neutral',
  purple: 'neutral',
  pink: 'neutral',
};

export function toneForLegacyColor(color) {
  return legacyColorToTone[color] || 'neutral';
}

export default function Badge({
  tone = 'neutral',
  size = 'md',
  className,
  children,
  ...rest
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        tones[tone] || tones.neutral,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

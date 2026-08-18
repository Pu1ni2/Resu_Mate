import React from 'react';
import { cn } from './cn';

/* Card — replaces .glass-card
 *
 * The old card stacked backdrop-filter: blur(20px) over a translucent fill,
 * plus a ::before hairline gradient. Two problems with that as a default:
 * translucent surfaces nested inside other translucent surfaces stop reading
 * as distinct planes (the bug that made the interview format toggle look
 * see-through), and blur on every card is expensive to composite while
 * scrolling.
 *
 * Solid surface + one hairline border instead. Glass is now reserved for
 * things that genuinely float over content — modals, popovers, the sticky
 * header — where the blur communicates depth rather than decorating.
 */
/* The craft detail: a 1px top-edge highlight, brightest at the centre and
 * falling off to the corners, as a real edge lit from above would. A flat
 * white line across the whole top reads like a border; the gradient reads like
 * light. Sits in a ::before via an arbitrary variant so it costs no extra DOM.
 */
const edgeHighlight =
  "relative before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px " +
  "before:bg-[linear-gradient(90deg,transparent,var(--color-highlight)_18%,var(--color-highlight-strong)_50%,var(--color-highlight)_82%,transparent)] " +
  "before:rounded-t-[inherit]";

const elevations = {
  0: '',
  1: 'shadow-e1',
  2: 'shadow-e2',
  3: 'shadow-e3',
};

export default function Card({
  as: Tag = 'div',
  padded = false,
  interactive = false,
  elevation = 1,
  highlight = true,
  className,
  children,
  ...rest
}) {
  return (
    <Tag
      className={cn(
        'bg-surface border border-line rounded-[14px]',
        elevations[elevation] ?? elevations[1],
        highlight && edgeHighlight,
        padded && 'p-5',
        interactive &&
          'cursor-pointer transition-[background-color,border-color,box-shadow] duration-[160ms] ease-out ' +
            'hover:border-line-strong hover:bg-surface-hover hover:shadow-e2',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Header strip for a Card — title row above a divider. */
export function CardHeader({ className, children, ...rest }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-5 py-4 border-b border-line',
        'text-[15px] font-semibold text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }) {
  return (
    <div className={cn('p-5', className)} {...rest}>
      {children}
    </div>
  );
}

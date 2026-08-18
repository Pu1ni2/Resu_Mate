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
export default function Card({
  as: Tag = 'div',
  padded = false,
  interactive = false,
  className,
  children,
  ...rest
}) {
  return (
    <Tag
      className={cn(
        'bg-surface border border-line rounded-[14px]',
        padded && 'p-5',
        interactive &&
          'cursor-pointer transition-colors duration-[120ms] ease-out hover:border-line-strong hover:bg-surface-hover',
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

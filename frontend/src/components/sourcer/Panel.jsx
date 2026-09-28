import React from 'react';
import Card from '../ui/Card';
import { cn } from '../ui/cn';

/* The frame every talent-map panel sits in: a titled card with an optional
 * figure on the right ("64 of the last 400 read"). */
export default function Panel({ title, meta, className, bodyClassName, children }) {
  return (
    <Card as="section" className={cn('flex flex-col', className)} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <h3 className="text-[12px] font-semibold text-ink-subtle">{title}</h3>
        {meta != null && <span className="text-[11px] text-ink-faint">{meta}</span>}
      </div>
      <div className={cn('px-4 pb-4', bodyClassName)}>{children}</div>
    </Card>
  );
}

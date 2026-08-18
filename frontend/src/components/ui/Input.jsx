import React from 'react';
import { cn } from './cn';

/* Input / Textarea / Select — replaces .input
 *
 * The old .input was 16px/20px padding with a 15px font and a 4px focus ring,
 * which made every form feel oversized next to the rest of the UI. This sits
 * on the same 44px control height as Button size="md" so a field and a button
 * line up on one row without ad-hoc margins.
 */

const field =
  'w-full bg-surface-raised text-ink font-sans text-sm ' +
  'border border-line rounded-[10px] ' +
  'placeholder:text-ink-subtle ' +
  'transition-[border-color,box-shadow] duration-[120ms] ease-out ' +
  'outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 ' +
  'disabled:opacity-45 disabled:pointer-events-none';

export default function Input({ className, invalid = false, ...rest }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        field,
        'h-11 px-3.5',
        invalid && 'border-critical focus:border-critical focus:ring-critical/25',
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, invalid = false, rows = 5, ...rest }) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        field,
        'px-3.5 py-3 leading-relaxed resize-y',
        invalid && 'border-critical focus:border-critical focus:ring-critical/25',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }) {
  return (
    <select
      className={cn(
        field,
        'h-11 px-3.5 cursor-pointer',
        // The native dropdown list is drawn by the OS and does not inherit the
        // field colours on every platform, so options set theirs explicitly.
        '[&>option]:bg-surface [&>option]:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Small caps label sitting above a field. */
export function Label({ className, children, ...rest }) {
  return (
    <label
      className={cn('text-xs font-semibold text-ink-subtle', className)}
      {...rest}
    >
      {children}
    </label>
  );
}

/** Label + field + optional error, stacked with consistent spacing. */
export function Field({ label, error, htmlFor, className, children }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error && <span className="text-xs text-critical">{error}</span>}
    </div>
  );
}

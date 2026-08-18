import React from 'react';
import { cn } from './cn';

/* Button
 *
 * Replaces the .btn / .btn-primary / .btn-secondary / .btn-ghost / .btn-danger
 * / .btn-icon family, which was defined twice (design-system.css and
 * global.css) with the later, looser definition winning.
 *
 * Three things the old primary did that read unpolished, and are gone here:
 *   - a 135deg gradient fill. Flat colour is calmer and matches the rest of
 *     the surface treatment.
 *   - translateY(-2px) on hover. Buttons that jump under the cursor feel
 *     unserious; the background shifts instead.
 *   - a coloured glow box-shadow. Structure now comes from borders.
 *
 * Focus is a visible 2px accent ring on :focus-visible, so it shows for
 * keyboard users without ringing on every mouse click.
 */

const base =
  'inline-flex items-center justify-center gap-2 font-sans font-medium ' +
  'whitespace-nowrap rounded-[10px] cursor-pointer select-none ' +
  'transition-[background-color,border-color,color] duration-[120ms] ease-out ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-canvas ' +
  'disabled:opacity-45 disabled:pointer-events-none';

const variants = {
  primary:
    'bg-accent text-ink-inverse border border-transparent ' +
    'hover:bg-accent-hover active:bg-accent-press',
  secondary:
    'bg-surface-raised text-ink border border-line ' +
    'hover:bg-surface-hover hover:border-line-strong',
  ghost:
    'bg-transparent text-ink-muted border border-transparent ' +
    'hover:bg-surface-raised hover:text-ink',
  danger:
    'bg-critical/12 text-critical border border-critical/35 ' +
    'hover:bg-critical/20',
  // Amber outline for a secondary action that still needs to read as the
  // accent path — used sparingly.
  accentGhost:
    'bg-accent-wash text-accent border border-accent-line hover:bg-accent/20',
};

const sizes = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[52px] px-7 text-base',
};

const iconSizes = {
  sm: 'h-9 w-9 p-0',
  md: 'h-11 w-11 p-0',
  lg: 'h-[52px] w-[52px] p-0',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon = false,
  className,
  type = 'button',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={cn(
        base,
        variants[variant] || variants.secondary,
        icon ? iconSizes[size] : sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

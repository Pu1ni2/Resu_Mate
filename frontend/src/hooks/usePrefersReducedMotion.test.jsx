import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import usePrefersReducedMotion from './usePrefersReducedMotion';

/* The stylesheet's prefers-reduced-motion rule collapses CSS animations, but SVG
 * SMIL is not CSS and keeps looping regardless. This hook is how the landing
 * page's five infinite <animate> elements get stopped, so it needs to be right
 * about a media query that jsdom does not implement by default.
 */

function Probe() {
  return <span>{usePrefersReducedMotion() ? 'reduced' : 'full'}</span>;
}

/** Install a matchMedia that reports `matches` and records its listeners. */
function stubMatchMedia({ matches, modern = true }) {
  const listeners = new Set();
  const mql = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    ...(modern
      ? {
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
      }
      // Older Safari has only the deprecated pair.
      : {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
      }),
  };
  window.matchMedia = vi.fn(() => mql);
  return {
    listeners,
    emit: (next) => {
      mql.matches = next;
      listeners.forEach(fn => fn({ matches: next }));
    },
  };
}

afterEach(() => {
  cleanup();
  delete window.matchMedia;
  vi.restoreAllMocks();
});

describe('usePrefersReducedMotion', () => {
  it('reports the initial preference without waiting for an event', () => {
    stubMatchMedia({ matches: true });
    render(<Probe />);
    // Read on first render, not in an effect — otherwise the animations play
    // for a frame before being pulled.
    expect(screen.getByText('reduced')).toBeTruthy();
  });

  it('reports full motion when the user has not asked to reduce it', () => {
    stubMatchMedia({ matches: false });
    render(<Probe />);
    expect(screen.getByText('full')).toBeTruthy();
  });

  it('follows the setting being changed while the page is open', () => {
    const mm = stubMatchMedia({ matches: false });
    render(<Probe />);
    expect(screen.getByText('full')).toBeTruthy();

    act(() => mm.emit(true));
    expect(screen.getByText('reduced')).toBeTruthy();
  });

  it('uses the deprecated listener API when that is all there is', () => {
    // Safari before 14 has addListener only; calling addEventListener throws.
    const mm = stubMatchMedia({ matches: false, modern: false });
    render(<Probe />);
    expect(mm.listeners.size).toBe(1);
    act(() => mm.emit(true));
    expect(screen.getByText('reduced')).toBeTruthy();
  });

  it('removes its listener on unmount', () => {
    const mm = stubMatchMedia({ matches: false });
    const { unmount } = render(<Probe />);
    expect(mm.listeners.size).toBe(1);
    unmount();
    expect(mm.listeners.size).toBe(0);
  });

  it('assumes full motion when matchMedia is missing entirely', () => {
    // jsdom without a stub, and any very old browser.
    delete window.matchMedia;
    expect(() => render(<Probe />)).not.toThrow();
    expect(screen.getByText('full')).toBeTruthy();
  });
});

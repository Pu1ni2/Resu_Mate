import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import useMediaQuery from './useMediaQuery';

/* The homepage's tabs run down the page on a wide screen and across it below
 * 1100px, and tell screen readers which; this hook says which applies. jsdom
 * has no matchMedia, so each test installs one. */

const NARROW = '(max-width: 1100px)';
const WIDE = '(min-width: 1101px)';

function Probe({ query }) {
  return <span>{useMediaQuery(query) ? 'matches' : 'no match'}</span>;
}

/** A matchMedia that answers each query from `state` and records listeners. */
function stubMatchMedia(state, { modern = true } = {}) {
  const lists = {};
  const listFor = (query) => {
    if (!lists[query]) {
      const listeners = new Set();
      lists[query] = {
        media: query,
        get matches() { return Boolean(state[query]); },
        listeners,
        ...(modern
          ? {
            addEventListener: (_, fn) => listeners.add(fn),
            removeEventListener: (_, fn) => listeners.delete(fn),
          }
          // Older Safari has only the deprecated pair.
          : {
            addListener: fn => listeners.add(fn),
            removeListener: fn => listeners.delete(fn),
          }),
      };
    }
    return lists[query];
  };
  window.matchMedia = vi.fn(listFor);
  return {
    listeners: query => listFor(query).listeners,
    set: (query, value) => {
      state[query] = value;
      listFor(query).listeners.forEach(fn => fn({ matches: value }));
    },
  };
}

afterEach(() => {
  cleanup();
  delete window.matchMedia;
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('answers on the first render, without waiting for an event', () => {
    stubMatchMedia({ [NARROW]: true });
    render(<Probe query={NARROW} />);
    expect(screen.getByText('matches')).toBeTruthy();
  });

  it('follows a change while the page is open', () => {
    const mm = stubMatchMedia({ [NARROW]: false });
    render(<Probe query={NARROW} />);
    expect(screen.getByText('no match')).toBeTruthy();
    act(() => mm.set(NARROW, true));
    expect(screen.getByText('matches')).toBeTruthy();
  });

  it('answers a new query at once, and listens to it instead of the old one', () => {
    const mm = stubMatchMedia({ [NARROW]: false, [WIDE]: true });
    const { rerender } = render(<Probe query={NARROW} />);
    expect(screen.getByText('no match')).toBeTruthy();
    rerender(<Probe query={WIDE} />);
    expect(screen.getByText('matches')).toBeTruthy();
    expect(mm.listeners(NARROW).size).toBe(0);
    expect(mm.listeners(WIDE).size).toBe(1);
  });

  it('uses the deprecated listener API when that is all there is', () => {
    const mm = stubMatchMedia({ [NARROW]: false }, { modern: false });
    render(<Probe query={NARROW} />);
    expect(mm.listeners(NARROW).size).toBe(1);
    act(() => mm.set(NARROW, true));
    expect(screen.getByText('matches')).toBeTruthy();
  });

  it('stops listening on unmount', () => {
    const mm = stubMatchMedia({ [NARROW]: false });
    const { unmount } = render(<Probe query={NARROW} />);
    expect(mm.listeners(NARROW).size).toBe(1);
    unmount();
    expect(mm.listeners(NARROW).size).toBe(0);
  });

  it('answers no when there is no matchMedia at all', () => {
    delete window.matchMedia;
    expect(() => render(<Probe query={NARROW} />)).not.toThrow();
    expect(screen.getByText('no match')).toBeTruthy();
  });
});

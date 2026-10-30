import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import InsightBar from './InsightBar';

/* A bar of the Insights view's charts: its value in words from the start, a
 * tooltip Escape puts away, and no waiting for someone who asks for less
 * motion. */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a chart bar', () => {
  it('keeps its exact value readable while it waits to come into view', () => {
    let onIntersect;
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { onIntersect = callback; }
      observe() {}
      disconnect() { disconnect(); }
    });
    const { container } = render(<InsightBar percent={60} detail="React · 3 of 5 selected candidates (60%)" />);
    const bar = screen.getByRole('img', { name: 'React · 3 of 5 selected candidates (60%)' });
    expect(bar.dataset.revealed).toBe('false');
    expect(container.querySelector('.clean-bar-fill').style.width).toBe('60%');

    act(() => onIntersect([{ isIntersecting: true }]));
    expect(bar.dataset.revealed).toBe('true');
    expect(disconnect).toHaveBeenCalled();
  });

  it('puts its tooltip away on Escape, and back when the focus leaves', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    render(<InsightBar percent={60} detail="React · 3 of 5 selected candidates (60%)" />);
    const bar = screen.getByRole('img');
    expect(bar.tabIndex).toBe(0);
    fireEvent.keyDown(bar, { key: 'Escape' });
    expect(bar.dataset.dismissed).toBe('true');
    fireEvent.blur(bar);
    expect(bar.dataset.dismissed).toBe('false');
  });

  it('is there at once, and watches nothing, for someone who asks for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class { observe() { observe(); } disconnect() {} });
    const { container } = render(<InsightBar percent={0} detail="Figma · 0 of 5 selected candidates (0%)" />);
    expect(screen.getByRole('img').dataset.revealed).toBe('true');
    expect(container.querySelector('.clean-bar-fill').style.width).toBe('0%');
    expect(observe).not.toHaveBeenCalled();
  });

  it('keeps its bar inside the track, whatever it is given', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    const { container, rerender } = render(<InsightBar percent={140} detail="Over" />);
    expect(container.querySelector('.clean-bar-fill').style.width).toBe('100%');
    rerender(<InsightBar percent={Number.NaN} detail="Unknown" />);
    expect(container.querySelector('.clean-bar-fill').style.width).toBe('0%');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import InsightBar from './InsightBar';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('insight chart details', () => {
  it('keeps exact values accessible while waiting for the chart to enter view', () => {
    let onIntersect;
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { onIntersect = callback; }
      observe() {}
      disconnect() { disconnect(); }
    });
    const { container } = render(<InsightBar percent={60} detail="React · 3 of 5 selected candidates (60%)" />);
    const bar = screen.getByRole('img', { name: /React · 3 of 5/ });
    expect(bar.dataset.revealed).toBe('false');
    expect(container.querySelector('.clean-bar-fill').style.width).toBe('60%');
    act(() => onIntersect([{ isIntersecting: true }]));
    expect(bar.dataset.revealed).toBe('true');
    expect(disconnect).toHaveBeenCalled();
    fireEvent.keyDown(bar, { key: 'Escape' });
    expect(bar.dataset.dismissed).toBe('true');
    fireEvent.blur(bar);
    expect(bar.dataset.dismissed).toBe('false');
  });

  it('shows a static zero value immediately with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class { observe() { observe(); } disconnect() {} });
    const { container } = render(<InsightBar percent={0} detail="No scored interviews in this range" />);
    expect(screen.getByRole('img').dataset.revealed).toBe('true');
    expect(container.querySelector('.clean-bar-fill').style.width).toBe('0%');
    expect(observe).not.toHaveBeenCalled();
  });
});

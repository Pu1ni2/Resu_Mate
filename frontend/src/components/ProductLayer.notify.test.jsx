import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProductLayer from './ProductLayer';
import { toast, notify } from '../services/notify';

/* ProductLayer's toast container and notification centre were unreachable: the
 * only entry point was useProduct(), and nothing in the codebase called it. The
 * markup rendered, the CSS was written, the aria-live was in place, and neither
 * could ever show anything.
 *
 * These tests render the real layer and drive it through the same events the
 * product uses, so "the shell exists" and "the shell works" stop being the same
 * green tick.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderLayer(path = '/hiring') {
  // ProductLayer reads the route to decide whether it is on a public page, so
  // it needs a router. /hiring is a product page — the toolbar is hidden on the
  // marketing pages by design.
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProductLayer><div>child</div></ProductLayer>
    </MemoryRouter>,
  );
}

describe('toasts', () => {
  it('renders a toast dispatched from anywhere', () => {
    renderLayer();
    act(() => toast('Screening finished', 'success'));
    expect(screen.getByText('Screening finished')).toBeTruthy();
  });

  it('puts the toast in a live region so it is announced', () => {
    renderLayer();
    act(() => toast('Upload failed', 'error'));
    // A toast that replaces alert() has to reach a screen reader; alert() did
    // that for free by stealing focus, and a div does not.
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live.textContent).toContain('Upload failed');
  });

  it('removes the toast when its time is up', () => {
    vi.useFakeTimers();
    renderLayer();
    act(() => toast('Transient'));
    expect(screen.getByText('Transient')).toBeTruthy();
    act(() => vi.advanceTimersByTime(4500));
    expect(screen.queryByText('Transient')).toBeNull();
  });

  it('shows several at once rather than replacing the last', () => {
    renderLayer();
    act(() => { toast('First'); toast('Second'); });
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('renders its children regardless', () => {
    renderLayer();
    expect(screen.getByText('child')).toBeTruthy();
  });
});

describe('notifications', () => {
  it('a dispatched notification reaches the bell', () => {
    renderLayer();
    act(() => notify('Report ready', 'Maya Chen — interview report'));
    // The badge counts unread. Before this it could only ever be absent.
    expect(document.querySelector('.pl-notif-badge')).toBeTruthy();
  });

  it('counts unread', () => {
    renderLayer();
    act(() => { notify('One', 'a'); notify('Two', 'b'); });
    expect(document.querySelector('.pl-notif-badge').textContent).toBe('2');
  });

  it('has no badge before anything happens', () => {
    renderLayer();
    expect(document.querySelector('.pl-notif-badge')).toBeNull();
  });
});

describe('calling into an unmounted layer', () => {
  it('is safe', () => {
    // Fire-and-forget callers must not need to know whether the layer is
    // mounted — services/notify.js is imported by non-component code too.
    expect(() => { toast('nobody listening'); notify('t', 'b'); }).not.toThrow();
  });
});

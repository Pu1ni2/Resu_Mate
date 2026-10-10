import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { wakeServer, resetWake, STARTING, READY } from './wake';
import { TOAST_EVENT } from './notify';

/* The free plan's backend sleeps and takes up to a minute to wake, and the
 * first request just hung. The app asks it on load and says so when it's slow. */

let toasts;
const onToast = e => toasts.push(e.detail);

function server(answerAfterMs, { ok = true, fail = false } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve, reject) => {
    setTimeout(() => (fail ? reject(new TypeError('Failed to fetch')) : resolve({ ok })), answerAfterMs);
  }));
}

beforeEach(() => {
  toasts = [];
  window.addEventListener(TOAST_EVENT, onToast);
  resetWake();
  vi.useFakeTimers();
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('waking the server', () => {
  it('says nothing when it answers quickly', async () => {
    const spy = server(300);
    const done = wakeServer();
    await vi.advanceTimersByTimeAsync(10000);
    await done;
    expect(String(spy.mock.calls[0][0])).toMatch(/\/health$/);
    expect(toasts).toEqual([]);
  });

  it('says it is starting after 5 seconds, and when it is ready', async () => {
    server(20000);
    const done = wakeServer();
    await vi.advanceTimersByTimeAsync(4999);
    expect(toasts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(toasts).toEqual([{ message: STARTING, type: 'info', duration: 60000 }]);
    await vi.advanceTimersByTimeAsync(15000);
    await done;
    expect(toasts.at(-1)).toEqual({ message: READY, type: 'success' });
  });

  it('does not say ready when it never answered', async () => {
    server(20000, { fail: true });
    const done = wakeServer();
    await vi.advanceTimersByTimeAsync(20000);
    await done;
    expect(toasts.map(t => t.message)).toEqual([STARTING]);
  });

  it('asks once per page', async () => {
    const spy = server(10);
    wakeServer();
    wakeServer();
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

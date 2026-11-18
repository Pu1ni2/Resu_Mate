import { describe, it, expect, afterEach, vi } from 'vitest';

import { BATCH_WAITS, followBatch, newClientKey, startBatch } from './inviteBatches';

/* Batch invitations are made in the background: the page starts one, and
 * asks after it until every candidate's invitation has finished. */

const SERVER_KEY = /^[A-Za-z0-9_-]{8,64}$/;  // what POST /api/pipeline/batches takes

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('batch invitations', () => {
  it('give each dialog a key the server takes, even where the browser makes none', () => {
    const one = newClientKey();
    expect(one).toMatch(SERVER_KEY);
    expect(newClientKey()).not.toBe(one);
    vi.stubGlobal('crypto', {});
    expect(newClientKey()).toMatch(SERVER_KEY);
    expect(newClientKey()).not.toBe(newClientKey());
  });

  it('are asked after every 2 seconds for a minute, then every 5, for 40 minutes', () => {
    expect(BATCH_WAITS.slice(0, 30).every(wait => wait === 2000)).toBe(true);
    expect(BATCH_WAITS.slice(30).every(wait => wait === 5000)).toBe(true);
    expect(BATCH_WAITS.reduce((all, wait) => all + wait, 0)).toBe(40 * 60 * 1000);
  });

  it('are asked after again when an answer doesn’t arrive, until the last wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const seen = vi.fn();
    followBatch(7, seen, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/pipeline\/batches\/7$/);
    expect(seen).not.toHaveBeenCalled();
  });

  it('stop being asked after once every invitation has finished', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ batch_id: 7, finished: true, outcomes: [] }),
    });
    const seen = vi.fn();
    followBatch(7, seen, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ finished: true }));
  });

  it('stop being asked after once the page closes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ batch_id: 7, finished: false, outcomes: [] }),
    });
    const stop = followBatch(7, vi.fn(), [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('say why one couldn’t be started', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: 'Invite up to 100 candidates at a time.' }) });
    await expect(startBatch({})).rejects.toThrow('Invite up to 100 candidates at a time.');
    // A refusal with no words for the manager says it plainly.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ detail: [{ loc: ['body'] }] }) });
    await expect(startBatch({})).rejects.toThrow('The invitations couldn’t be started.');
  });
});

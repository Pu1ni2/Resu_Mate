import { describe, it, expect, afterEach, vi } from 'vitest';

import { EVALUATION_WAITS, evaluationWritten, followEvaluation, writing } from './evaluationRequests';

/* Each evaluation is written in the background: its page asks after it
 * until it's written, or couldn't be. */

const answer = request => ({ ok: true, status: 200, json: async () => request });
const PENDING = { request_id: 5, status: 'pending', error: null, evaluation: null };
const DONE = { ...PENDING, status: 'done', evaluation: { evaluation_id: 9, report: '## A strong fit' } };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('following an evaluation being written', () => {
  it('asks every 3 seconds for two minutes, then every 15, for ten minutes more', () => {
    expect(EVALUATION_WAITS.slice(0, 40).every(wait => wait === 3000)).toBe(true);
    expect(EVALUATION_WAITS.slice(40).every(wait => wait === 15000)).toBe(true);
    expect(EVALUATION_WAITS.reduce((all, wait) => all + wait, 0)).toBe(12 * 60 * 1000);
  });

  it('counts only a pending one as still being written', () => {
    expect(['pending', 'done', 'failed', undefined].map(status => writing({ status }))).toEqual([true, false, false, false]);
    expect(writing(null)).toBe(false);
  });

  it('asks until it has been written, passing on each answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answers = [answer(PENDING), answer(DONE)];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answers.shift());
    const seen = vi.fn();
    followEvaluation(5, seen, [1000, 1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/chat\/evaluations\/5$/);
    expect(seen.mock.calls.map(([r]) => r.status)).toEqual(['pending', 'done']);
  });

  it('asks no more after one gone meanwhile, and again after one out of reach, until the last wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const gone = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    followEvaluation(5, vi.fn(), [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(gone).toHaveBeenCalledTimes(1);
    gone.mockRejectedValue(new TypeError('Failed to fetch'));
    const outOfWaits = vi.fn();
    followEvaluation(6, vi.fn(), [1000, 1000, 1000], outOfWaits);
    await vi.advanceTimersByTimeAsync(10000);
    expect(gone).toHaveBeenCalledTimes(4);
    expect(outOfWaits).toHaveBeenCalledTimes(1);
  });

  it('asks no more once the page closes, leaving nothing waiting', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(PENDING));
    const stop = followEvaluation(5, vi.fn(), [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('waiting for an evaluation, for the assistant', () => {
  it('ends once it has been written, with how it went', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answers = [answer(PENDING), answer(DONE)];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answers.shift());
    const done = evaluationWritten(PENDING, { waits: [1000, 1000, 1000] });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toEqual(DONE);
  });

  it('ends at once for one not being written, and as it last stood when the waits run out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(evaluationWritten(DONE)).resolves.toEqual(DONE);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchMock.mockResolvedValue(answer(PENDING));
    const done = evaluationWritten(PENDING, { waits: [1000, 1000] });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toEqual(PENDING);
  });

  it('waits no more once the assistant closes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(PENDING));
    const closed = new AbortController();
    const done = evaluationWritten(PENDING, { signal: closed.signal, waits: [1000, 1000, 1000] });
    await vi.advanceTimersByTimeAsync(1000);
    closed.abort();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toEqual(PENDING);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

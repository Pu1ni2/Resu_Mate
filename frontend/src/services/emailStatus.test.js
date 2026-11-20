import { describe, it, expect, afterEach, vi } from 'vitest';

import { EMAIL_WAITS, emailsEnded, followEmails, pending } from './emailStatus';

/* An email a page asked for goes by the server's outbox, a moment later: the
 * page asks after it until it has gone, or failed. */

const answer = (...emails) => ({ ok: true, status: 200, json: async () => ({ emails }) });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('following emails', () => {
  it('asks every 2 seconds for half a minute, then every 10, for five minutes more', () => {
    expect(EMAIL_WAITS.slice(0, 15).every(wait => wait === 2000)).toBe(true);
    expect(EMAIL_WAITS.slice(15).every(wait => wait === 10000)).toBe(true);
    expect(EMAIL_WAITS.reduce((all, wait) => all + wait, 0)).toBe(330 * 1000);
  });

  it('counts an email waiting or queued as still to go, and any other as ended', () => {
    expect(['queued', 'held'].map(status => pending({ status }))).toEqual([true, true]);
    expect(['sent', 'failed', 'skipped', 'cancelled'].map(status => pending({ status }))).toEqual([false, false, false, false]);
    expect(pending(null)).toBe(false);
  });

  it('asks until every email has ended, passing on each answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answers = [answer({ id: 1, status: 'queued' }, { id: 2, status: 'sent' }),
                     answer({ id: 1, status: 'failed', error: 'No.' }, { id: 2, status: 'sent' })];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answers.shift());
    const seen = vi.fn();
    followEmails([1, 2], seen, [1000, 1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/emails\?ids=1,2$/);
    expect(seen).toHaveBeenLastCalledWith({ 1: { id: 1, status: 'failed', error: 'No.' }, 2: { id: 2, status: 'sent' } });
  });

  it('asks again when an answer doesn’t arrive, until the last wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    followEmails([1], vi.fn(), [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks no more once the page closes, nor at all with nothing to ask after', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer({ id: 1, status: 'queued' }));
    const stop = followEmails([1], vi.fn(), [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    followEmails([], vi.fn(), [1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('waiting for emails, for the assistant', () => {
  it('ends once every email has, with how each went', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answers = [answer({ id: 1, status: 'queued' }), answer({ id: 1, status: 'sent' })];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answers.shift());
    const done = emailsEnded([1], { waits: [1000, 1000, 1000] });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toEqual({ 1: { id: 1, status: 'sent' } });
  });

  it('ends at once with no emails, and as they last stood when the waits run out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(emailsEnded([])).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchMock.mockResolvedValue(answer({ id: 1, status: 'queued' }));
    const done = emailsEnded([1], { waits: [1000, 1000] });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toEqual({ 1: { id: 1, status: 'queued' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('waits no more once the assistant closes, even before it began', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer({ id: 1, status: 'queued' }));
    const closed = new AbortController();
    const done = emailsEnded([1], { signal: closed.signal, waits: [1000, 1000, 1000] });
    await vi.advanceTimersByTimeAsync(1000);
    closed.abort();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toEqual({ 1: { id: 1, status: 'queued' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(emailsEnded([2], { signal: closed.signal })).resolves.toEqual({});
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

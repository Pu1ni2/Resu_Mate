import { describe, it, expect, afterEach, vi } from 'vitest';

import { QUESTION_WAITS, followQuestions, writing } from './interviewQuestions';

/* A single interview's questions are written in the background: its page
 * asks after it until they are. */

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const PENDING = { questions_status: 'pending', questions: [] };
const READY = { questions_status: 'ready', questions: ['Why data?'] };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('following questions being written', () => {
  it('asks every 3 seconds for a minute, then every 15, for five minutes more', () => {
    expect(QUESTION_WAITS.slice(0, 20).every(wait => wait === 3000)).toBe(true);
    expect(QUESTION_WAITS.slice(20).every(wait => wait === 15000)).toBe(true);
    expect(QUESTION_WAITS.reduce((all, wait) => all + wait, 0)).toBe(6 * 60 * 1000);
  });

  it('counts only pending ones as still being written', () => {
    expect(['pending', 'ready', 'failed', undefined].map(s => writing({ questions_status: s })))
      .toEqual([true, false, false, false]);
  });

  it('asks after each wait in turn, until they are written, then passes the interview on once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answers = [answer(PENDING), answer(READY)];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answers.shift());
    const written = vi.fn();
    followQuestions(7, written, [1000, 5000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999);  // 5999 in all
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/chat\/interviews\/7$/);
    expect(written.mock.calls).toEqual([[READY]]);
  });

  it('asks no more after one deleted meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer({ detail: 'Interview not found' }, 404));
    const written = vi.fn();
    followQuestions(7, written, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(written).not.toHaveBeenCalled();
  });

  it('asks again after a server error or when out of reach, passing on only the interview', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const replies = [() => answer({ detail: 'Something went wrong' }, 500),
                     () => { throw new TypeError('Failed to fetch'); },
                     () => answer(READY)];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => replies.shift()());
    const written = vi.fn();
    followQuestions(7, written, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(written.mock.calls).toEqual([[READY]]);
  });

  it('asks no more after the last wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answer(PENDING));
    followQuestions(7, vi.fn(), [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks no more once the page closes, leaving nothing waiting, nor passes on what it was told after', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const replies = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { replies.push(resolve); }));
    const written = vi.fn();
    // Three asking as the page closes: then told they're still being
    // written, that they are, and of a server error.
    const asking = [7, 8, 10].map(id => followQuestions(id, written, [1000, 1000, 1000]));
    await vi.advanceTimersByTimeAsync(1000);
    asking.forEach(stop => stop());
    replies[0](answer(PENDING));
    replies[1](answer(READY));
    replies[2](answer({ detail: 'Something went wrong' }, 500));
    // And one waiting to ask.
    followQuestions(9, written, [1000, 1000, 1000])();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(written).not.toHaveBeenCalled();
  });
});

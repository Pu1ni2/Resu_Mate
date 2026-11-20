import { describe, it, expect, afterEach, vi } from 'vitest';

import { candidatesAPI } from './api';
import { READING_WAITS, followReadings, reading } from './resumeReading';

/* An uploaded résumé is read by the AI in the background: the page asks after
 * each candidate still being read until they have been. */

const answer = candidate => ({ data: candidate });
const notFound = () => Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('following résumés being read', () => {
  it('asks every 3 seconds for a minute, then every 15, for ten minutes more', () => {
    expect(READING_WAITS.slice(0, 20).every(wait => wait === 3000)).toBe(true);
    expect(READING_WAITS.slice(20).every(wait => wait === 15000)).toBe(true);
    expect(READING_WAITS.reduce((all, wait) => all + wait, 0)).toBe(11 * 60 * 1000);
  });

  it('counts only a reading that is pending as still going', () => {
    expect(['pending', 'done', 'failed', undefined].map(status => reading({ analysis_status: status })))
      .toEqual([true, false, false, false]);
    expect(reading(null)).toBe(false);
  });

  it('asks until each has been read, passing each on once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answers = {
      1: [{ id: 1, analysis_status: 'pending' }, { id: 1, analysis_status: 'done', predicted_role: 'Engineer' }],
      2: [{ id: 2, analysis_status: 'failed' }],
    };
    const getOne = vi.spyOn(candidatesAPI, 'getOne').mockImplementation(async id => answer(answers[id].shift()));
    const read = vi.fn();
    followReadings([1, 2], read, [1000, 1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getOne.mock.calls.map(([id]) => id)).toEqual([1, 2, 1]);
    expect(read.mock.calls.map(([c]) => [c.id, c.analysis_status])).toEqual([[2, 'failed'], [1, 'done']]);
  });

  it('asks no more after one deleted meanwhile, and again after one out of reach, until the last wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const getOne = vi.spyOn(candidatesAPI, 'getOne').mockImplementation(async (id) => {
      throw id === 1 ? notFound() : new Error('Network Error');
    });
    const read = vi.fn();
    followReadings([1, 2], read, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getOne.mock.calls.map(([id]) => id)).toEqual([1, 2, 2, 2]);
    expect(read).not.toHaveBeenCalled();
  });

  it('asks no more once the page closes, nor at all with no one to ask after', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const getOne = vi.spyOn(candidatesAPI, 'getOne').mockResolvedValue(answer({ id: 1, analysis_status: 'pending' }));
    const stop = followReadings([1], vi.fn(), [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    // Nothing is left waiting.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getOne).toHaveBeenCalledTimes(1);
    followReadings([], vi.fn(), [1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getOne).toHaveBeenCalledTimes(1);
  });

  it('says nothing of an answer that comes after the page has closed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let reply;
    vi.spyOn(candidatesAPI, 'getOne').mockReturnValue(new Promise((resolve) => { reply = resolve; }));
    const read = vi.fn();
    const stop = followReadings([1], read, [1000, 1000]);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    reply(answer({ id: 1, analysis_status: 'done' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).not.toHaveBeenCalled();
  });
});

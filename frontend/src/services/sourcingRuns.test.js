import { describe, it, expect, afterEach, vi } from 'vitest';

import { RUN_WAITS, active, followRun, progressEvents } from './sourcingRuns';

/* A Find Candidates search runs on the server, in the background; the page
 * follows it by its id, asking what it wrote since the last write it saw. */

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const run = (status, seq, extra = {}) => ({ id: 9, status, seq, plan: {}, stats: {}, warnings: null, error: null, ...extra });
const progress = (status, seq, profiles = [], extra = {}) => ({ run: run(status, seq, extra), profiles });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a search followed by its id', () => {
  it('is asked after every second and a half, for over half an hour, the longest a search runs', () => {
    expect(RUN_WAITS.every(wait => wait === 1500)).toBe(true);
    expect(RUN_WAITS.length * 1500).toBeGreaterThan(30 * 60 * 1000);
  });

  it('is asked after every second and a half unless told otherwise', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answer(progress('running', 1)));
    followRun(9, vi.fn(), 0);
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1501); // 3000 in all
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(12000); // 15000 in all
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('is under way while waiting to run, running, or asked to stop', () => {
    expect(['queued', 'running', 'stopping', 'complete', 'stopped', 'failed'].map(status => active({ status })))
      .toEqual([true, true, true, false, false, false]);
    expect(active(undefined)).toBe(false);
  });

  it('asks after each wait, from the last write it saw, until the search has ended', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answers = [answer(progress('queued', 0)), answer(progress('running', 2)), answer(progress('complete', 5))];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answers.shift());
    const seen = vi.fn();
    followRun(9, seen, 0, [1000, 5000, 1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000); // 5999 in all
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock.mock.calls.map(([url]) => String(url).replace(/^.*\/api/, '/api'))).toEqual([
      '/api/sourcer/runs/9/progress?after=0', '/api/sourcer/runs/9/progress?after=0',
      '/api/sourcer/runs/9/progress?after=2']);
    expect(seen.mock.calls.map(([p]) => p.run.status)).toEqual(['queued', 'running', 'complete']);
  });

  it('begins from the write it is told it has seen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(progress('stopped', 7)));
    followRun(9, vi.fn(), 4, [1000]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/sourcer\/runs\/9\/progress\?after=4$/);
  });

  it('asks no more after one deleted, nor after the last wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer({ detail: 'Run not found' }, 404));
    const seen = vi.fn();
    followRun(9, seen, 0, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen).not.toHaveBeenCalled();
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => answer(progress('running', 1)));
    followRun(9, seen, 0, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks again after a server error or when out of reach, passing on only answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const replies = [() => answer({ detail: 'Something went wrong' }, 500),
                     () => { throw new TypeError('Failed to fetch'); },
                     () => answer(progress('complete', 3))];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => replies.shift()());
    const seen = vi.fn();
    followRun(9, seen, 0, [1000, 1000, 1000]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(seen.mock.calls.map(([p]) => p.run.status)).toEqual(['complete']);
  });

  it('asks no more once the page closes, leaving nothing waiting, nor passes on an answer after', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const replies = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { replies.push(resolve); }));
    const seen = vi.fn();
    // Two asking as the page closes: then told it runs on, and of a server error.
    const asking = [followRun(9, seen, 0, [1000, 1000]), followRun(10, seen, 0, [1000, 1000])];
    await vi.advanceTimersByTimeAsync(1000);
    asking.forEach(stop => stop());
    replies[0](answer(progress('running', 1)));
    replies[1](answer({ detail: 'Something went wrong' }, 500));
    // And one waiting to ask.
    followRun(11, seen, 0, [1000, 1000])();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("a followed search's answers, as the talent map's events", () => {
  const found = { id: 91, pid: 'web:lee', source: 'web', name: 'Lee Park', verdict: null };
  const judged = { id: 92, pid: 'web:ada', source: 'web', name: 'Ada', verdict: 'shortlist', score: 88,
                   criteria: [], judgement: 'Strong.', filter_match: false, miss_reason: 'career_pivot', ms: 120, tokens: 400 };

  it('says each person found, judged once they are, with the ids to act on them by', () => {
    const plan = { criteria: [{ id: 'c1', label: 'Python', kind: 'must' }] };
    const events = progressEvents(progress('running', 2, [found, judged], {
      plan, stats: { found: 2, judged: 1 }, warnings: ['Searching GitHub failed; carrying on without it.'] }));
    const { id: _found, ...lee } = found;
    const { id: _judged, ...ada } = judged;
    expect(events).toEqual([
      { type: 'plan', plan },
      { type: 'found', person: lee },
      { type: 'found', person: ada },
      { type: 'judged', ...ada },
      { type: 'saved', run_id: 9, profile_ids: { 'web:lee': 91, 'web:ada': 92 } },
      { type: 'stats', found: 2, judged: 1 },
      { type: 'warning', message: 'Searching GitHub failed; carrying on without it.' },
    ]);
  });

  it('says no plan before it is written', () => {
    expect(progressEvents(progress('queued', 0)).map(event => event.type)).toEqual(['saved', 'stats']);
  });

  it("says how it ended: done, or failed and why; a stop is the page's to say", () => {
    const ending = status => progressEvents(progress(status, 4, [], { stats: { found: 0 }, error: status === 'failed' ? 'The search stopped unexpectedly.' : null }))
      .slice(2);
    expect(ending('complete')).toEqual([{ type: 'done', stats: { found: 0 } }]);
    expect(ending('failed')).toEqual([{ type: 'error', message: 'The search stopped unexpectedly.' },
                                      { type: 'done', stats: { found: 0 } }]);
    expect(ending('stopped')).toEqual([]);
    expect(ending('stopping')).toEqual([]);
  });
});

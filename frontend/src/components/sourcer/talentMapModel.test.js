import { describe, it, expect } from 'vitest';

import {
  talentMapReducer as reduce, initialState, cellState, shortlistOf, filterComparisonOf,
  SAMPLE_SIZE, LOG_SIZE,
} from './talentMapModel';

/* Every panel on the page reads this one state, so its arithmetic is the page's
 * arithmetic: what colour a square is, what "Read everyone +M" counts, and what
 * a reopened run looks like. */

const person = (pid, extra = {}) => ({ pid, source: pid.split(':')[0], name: pid, ...extra });
const found = pid => ({ type: 'found', person: person(pid) });
const judged = (pid, verdict, filter_match, extra = {}) => ({
  type: 'judged', pid, verdict, filter_match, score: verdict === 'shortlist' ? 80 : 20,
  criteria: [], judgement: `${pid} judged`, miss_reason: null, ...extra,
});

function run(events) {
  return reduce(reduce(initialState, { type: 'start', description: 'Backend engineer' }), { type: 'events', events });
}

describe('cells', () => {
  it('are unread until judged, then coloured by verdict and by filter', () => {
    expect(cellState({})).toBe('unread');
    expect(cellState({ verdict: 'passed' })).toBe('passed');
    expect(cellState({ verdict: 'shortlist', filter_match: true })).toBe('short_filter');
    expect(cellState({ verdict: 'shortlist', filter_match: false })).toBe('short_reading');
  });
});

describe('a live run', () => {
  const events = [
    { type: 'plan', plan: { criteria: [{ id: 'c1', label: 'Python', kind: 'must' }] } },
    found('github:a'), found('github:b'), found('web:c'), found('upload:d'),
    judged('github:a', 'shortlist', false, { miss_reason: 'non_standard_title' }),
    judged('github:b', 'shortlist', true),
    judged('web:c', 'passed', true),
  ];

  it('keeps one cell per person, in the order they were found', () => {
    const s = run(events);
    expect(s.order).toEqual(['github:a', 'github:b', 'web:c', 'upload:d']);
    expect(s.order.map(pid => cellState(s.people[pid]))).toEqual(['short_reading', 'short_filter', 'passed', 'unread']);
  });

  it('counts as it goes, without waiting for the server stats', () => {
    expect(run(events).counts).toEqual({ found: 4, judged: 3, shortlisted: 2, byFilter: 1, filterWouldShow: 2 });
  });

  it('splits the shortlist into found-by-filter and only-by-reading, with reasons', () => {
    const cmp = filterComparisonOf(run(events));
    expect(cmp.byFilter).toBe(1);
    expect(cmp.onlyByReading).toBe(1);
    expect(cmp.reasons.find(r => r.key === 'non_standard_title').count).toBe(1);
    // The reasons add up to the people only reading found.
    expect(cmp.reasons.reduce((n, r) => n + r.count, 0)).toBe(cmp.onlyByReading);
  });

  it('shows the latest judgement as judging now, newest first in the sample and log', () => {
    const s = run(events);
    expect(s.current).toBe('web:c');
    expect(s.sample).toEqual(['web:c', 'github:b', 'github:a']);
    expect(s.log[0]).toBe('web:c');
  });

  it('ignores a repeat or an unknown person rather than counting twice', () => {
    const s = run([...events, found('github:a'), judged('github:a', 'shortlist', false), judged('ghost:x', 'shortlist', false)]);
    expect(s.counts.found).toBe(4);
    expect(s.counts.judged).toBe(3);
  });

  it('caps the sample and the log', () => {
    const many = [];
    for (let i = 0; i < 100; i += 1) many.push(found(`web:${i}`), judged(`web:${i}`, 'passed', false));
    const s = run(many);
    expect(s.sample).toHaveLength(SAMPLE_SIZE);
    expect(s.log).toHaveLength(LOG_SIZE);
    expect(s.order).toHaveLength(100);
  });

  it('ranks the shortlist best first', () => {
    const s = run([found('web:x'), found('web:y'),
      judged('web:x', 'shortlist', false, { score: 70 }), judged('web:y', 'shortlist', false, { score: 95 })]);
    expect(shortlistOf(s).map(p => p.pid)).toEqual(['web:y', 'web:x']);
  });

  it('takes ids from the saved event and ends on done', () => {
    const s = run([...events, { type: 'saved', run_id: 7, profile_ids: { 'github:a': 70 } },
      { type: 'done', stats: { judged: 3, elapsed_s: 4 } }]);
    expect(s.runId).toBe(7);
    expect(s.profileIds['github:a']).toBe(70);
    expect(s.status).toBe('done');
    expect(s.stats.elapsed_s).toBe(4);
  });

  it('records warnings once each and an error as the ending', () => {
    const s = run([{ type: 'warning', message: 'rate limit' }, { type: 'warning', message: 'rate limit' },
      { type: 'error', message: 'stopped unexpectedly' }, { type: 'done', stats: {} }]);
    expect(s.warnings).toEqual(['rate limit']);
    expect(s.status).toBe('error');
  });

  it('does not change the state it was given', () => {
    const before = run(events);
    const snapshot = JSON.stringify(before);
    reduce(before, { type: 'events', events: [found('web:z'), judged('web:z', 'shortlist', false)] });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('marks a stop only while running', () => {
    expect(reduce(run(events), { type: 'stopped' }).status).toBe('stopped');
    expect(reduce(initialState, { type: 'stopped' }).status).toBe('idle');
  });
});

describe('a reopened run', () => {
  const savedRun = { id: 3, description: 'Backend engineer', status: 'stopped', plan: { criteria: [] }, stats: { elapsed_s: 9 } };
  const profiles = [
    { id: 31, pid: 'github:a', source: 'github', name: 'A', verdict: 'shortlist', score: 90, filter_match: false, miss_reason: 'career_pivot' },
    { id: 32, pid: 'web:b', source: 'web', name: 'B', verdict: 'passed', score: 30, filter_match: true },
  ];

  it('comes back as it ended, with ids for every person', () => {
    const s = reduce(initialState, { type: 'loaded', run: savedRun, profiles });
    expect(s.status).toBe('stopped');
    expect(s.runId).toBe(3);
    expect(s.profileIds).toEqual({ 'github:a': 31, 'web:b': 32 });
    expect(s.counts).toEqual({ found: 2, judged: 2, shortlisted: 1, byFilter: 0, filterWouldShow: 1 });
    expect(s.sources).toEqual({ upload: 0, github: 1, web: 1 });
    expect(filterComparisonOf(s).reasons.find(r => r.key === 'career_pivot').count).toBe(1);
  });

  it('leaves the initial state untouched', () => {
    reduce(initialState, { type: 'loaded', run: savedRun, profiles });
    expect(initialState.sources).toEqual({ upload: 0, github: 0, web: 0 });
    expect(initialState.profileIds).toEqual({});
  });

  it('can mark someone saved or dismissed', () => {
    const s = reduce(reduce(initialState, { type: 'loaded', run: savedRun, profiles }), { type: 'profileStatus', pid: 'web:b', status: 'dismissed' });
    expect(s.people['web:b'].status).toBe('dismissed');
  });
});

/* A search the server runs in the background, followed by its id: its people
 * and their ids come a few at a time, and a run reopened may still be under
 * way. */
describe('a followed run', () => {
  it('counts each person found for their source', () => {
    const s = run([found('github:a'), found('github:b'), found('web:c')]);
    expect(s.sources).toEqual({ upload: 0, github: 2, web: 1 });
  });

  it('gathers the ids to act on people by as they come', () => {
    const s = run([
      found('github:a'), found('web:b'),
      { type: 'saved', run_id: 9, profile_ids: { 'github:a': 91 } },
      { type: 'saved', run_id: 9, profile_ids: { 'web:b': 92 } },
    ]);
    expect((({ runId, profileIds }) => ({ runId, profileIds }))(s)).toEqual({ runId: 9, profileIds: { 'github:a': 91, 'web:b': 92 } });
  });

  it('says it was asked to stop, while it runs, until it has', () => {
    const asked = reduce(run([found('github:a')]), { type: 'stopping' });
    expect(asked.stopping).toBe(true);
    expect(reduce(asked, { type: 'stopped' })).toMatchObject({ status: 'stopped', stopping: false });
    expect(reduce(initialState, { type: 'stopping' }).stopping).toBe(false);
  });
});

describe('a reopened run still under way, or failed', () => {
  const profiles = [
    { id: 31, pid: 'github:a', source: 'github', name: 'A', verdict: 'shortlist', score: 90, filter_match: false },
    // Found, not yet judged.
    { id: 32, pid: 'web:b', source: 'web', name: 'B', verdict: null, score: 0 },
  ];
  const reopened = (status, extra = {}) => reduce(initialState, {
    type: 'loaded', run: { id: 4, description: 'Designer', status, plan: { criteria: [] }, stats: {}, ...extra }, profiles,
  });

  it('runs on while waiting to run, running or asked to stop', () => {
    expect(['queued', 'running', 'stopping', 'complete', 'stopped'].map(status => reopened(status).status))
      .toEqual(['running', 'running', 'running', 'done', 'stopped']);
    expect([reopened('running').stopping, reopened('stopping').stopping]).toEqual([false, true]);
  });

  it('keeps someone found but not yet judged on the map, not counted as read', () => {
    const s = reopened('running');
    expect(s.order).toEqual(['github:a', 'web:b']);
    expect(s.counts).toEqual({ found: 2, judged: 1, shortlisted: 1, byFilter: 0, filterWouldShow: 0 });
    expect([s.sample, s.log, s.current]).toEqual([['github:a'], ['github:a'], 'github:a']);
    expect(s.profileIds).toEqual({ 'github:a': 31, 'web:b': 32 });
  });

  it('says why one failed, with its warnings', () => {
    const s = reopened('failed', { error: 'The search stopped unexpectedly.', warnings: ['Searching GitHub failed; carrying on without it.'] });
    expect([s.status, s.error, s.warnings]).toEqual(['error', 'The search stopped unexpectedly.', ['Searching GitHub failed; carrying on without it.']]);
    expect(reopened('failed').error).toBe('The search stopped unexpectedly.');
    expect([reopened('complete').error, reopened('complete').warnings]).toEqual(['', []]);
  });
});

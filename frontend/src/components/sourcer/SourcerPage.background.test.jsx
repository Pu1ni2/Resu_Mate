import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import SourcerPage from './SourcerPage';
import api from '../../services/api';
import { TOAST_EVENT } from '../../services/notify';
import { followRun } from '../../services/sourcingRuns';

/* A search the server runs in the background (its sourcing.search job): the
 * page starts it, follows it by its id, and stops it by asking. Leaving the
 * page stops only the following. The follower stands in here, answering as
 * each test says; services/sourcingRuns.test.js tests it. */

vi.mock('../../services/sourcingRuns', async importOriginal => ({ ...(await importOriginal()), followRun: vi.fn() }));

const DESCRIPTION = 'Backend engineer in Boston, strong Python';
const GOES_ON = 'The search goes on if you leave this page. It’s in Past searches when you come back.';
const PLAN = {
  req: { title: 'Backend Engineer', location: 'Boston', summary: '' },
  criteria: [{ id: 'c1', label: 'Python depth', kind: 'must' }], filter: {}, github_queries: [], web_queries: [],
};
const person = (id, pid, name, verdict = null) => ({
  id, pid, source: pid.split(':')[0], name, url: `https://example.com/${id}`, verdict, status: 'new',
  ...(verdict ? {
    score: verdict === 'shortlist' ? 90 : 20, filter_match: false, miss_reason: null, ms: 120, tokens: 400,
    criteria: [{ id: 'c1', value: 'Python services', level: 'strong' }], judgement: `${name} judgement.`,
  } : { score: 0 }),
});
const run = (status, seq, extra = {}) => ({
  id: 9, description: DESCRIPTION, status, seq, plan: PLAN, stats: { found: 2, judged: 1, github_total: 5000 },
  warnings: null, error: null, ...extra,
});

let following; // what the page last asked to follow: { runId, onProgress, after, stop }
let history; // Past searches
let saved; // GET /sourcer/runs/{id}

function startedInTheBackground() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/sourcer/runs') && options.method === 'POST') {
      return { ok: true, status: 202, json: async () => ({ run_id: 9, status: 'queued' }) };
    }
    throw new Error(`not expected: ${url}`);
  });
}

function renderPage() {
  return render(<MemoryRouter><SourcerPage /></MemoryRouter>);
}

async function search() {
  fireEvent.change(screen.getByLabelText('Who are you looking for?'), { target: { value: DESCRIPTION } });
  fireEvent.click(screen.getByRole('button', { name: /Find candidates/ }));
  await vi.waitFor(() => expect(following).toBeTruthy());
}

// The server answers the follower.
async function answers(progress) {
  await act(async () => { following.onProgress(progress); });
}

const closing = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('resumate_hm_token', 'jwt-test');
  vi.restoreAllMocks();
  following = null;
  history = [];
  saved = {};
  followRun.mockReset();
  followRun.mockImplementation((runId, onProgress, after) => {
    const stop = vi.fn();
    following = { runId, onProgress, after, stop };
    return stop;
  });
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/sourcer/runs') return { data: { runs: history } };
    const id = Number(url.split('/').pop());
    if (saved[id]) return { data: saved[id] };
    throw { response: { status: 404, data: { detail: 'Run not found' } } };
  });
});
afterEach(cleanup);

describe('a search run in the background', () => {
  it('is followed from its start until it ends, its people ready to act on', async () => {
    startedInTheBackground();
    renderPage();
    await search();
    expect([following.runId, following.after]).toEqual([9, 0]);
    // It goes on without the page, so closing the tab asks nothing.
    expect(await screen.findByText(GOES_ON)).toBeTruthy();
    expect(closing()).toBe(false);

    await answers({ run: run('running', 1), profiles: [person(91, 'github:ada', 'Ada Lovelace', 'shortlist'),
                                                        person(92, 'github:bob', 'Bob Stone')] });
    expect(await screen.findByText(/Backend Engineer · Boston · 2 people/)).toBeTruthy();
    expect(screen.getByTestId('population-map').children).toHaveLength(2);
    expect(screen.getByText(/GitHub reports 5,000 matches; this run reads 2 of them/)).toBeTruthy();

    await answers({ run: run('complete', 2, { stats: { found: 2, judged: 2 } }),
                    profiles: [person(92, 'github:bob', 'Bob Stone', 'passed')] });
    expect(await screen.findByText('Every person found has been read')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Ada Lovelace' }).disabled).toBe(false);
  });

  it('stops when asked, saying so until it has', async () => {
    startedInTheBackground();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { run_id: 9, status: 'stopping' } });
    renderPage();
    await search();
    await answers({ run: run('running', 1), profiles: [person(91, 'github:ada', 'Ada Lovelace')] });
    fireEvent.click(await screen.findByRole('button', { name: /^Stop$/ }));
    const stopping = await screen.findByRole('button', { name: /Stopping…/ });
    expect(post).toHaveBeenCalledWith('/sourcer/runs/9/stop');
    expect(stopping.disabled).toBe(true);
    await answers({ run: run('stopped', 2), profiles: [] });
    expect(await screen.findByText('Stopped. Everyone judged so far is saved')).toBeTruthy();
  });

  it('says so when it could not be stopped, and Stop can be tried again', async () => {
    startedInTheBackground();
    const post = vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 500, data: {} } });
    const toasts = [];
    const listen = e => toasts.push(e.detail.message);
    window.addEventListener(TOAST_EVENT, listen);
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: /^Stop$/ }));
    await vi.waitFor(() => expect(toasts).toEqual(['The search couldn’t be stopped. Please try again.']));
    window.removeEventListener(TOAST_EVENT, listen);
    // Asked of this search, though nothing was heard of it yet.
    expect(post).toHaveBeenCalledWith('/sourcer/runs/9/stop');
    expect(screen.getByRole('button', { name: /^Stop$/ }).disabled).toBe(false);
  });

  it('says why it failed', async () => {
    startedInTheBackground();
    renderPage();
    await search();
    await answers({ run: run('failed', 3, { error: 'The search stopped unexpectedly.' }), profiles: [] });
    expect(await screen.findByText('The search stopped early')).toBeTruthy();
    expect(screen.getByText('The search stopped unexpectedly.')).toBeTruthy();
  });

  it('runs on when the page is left: only the following stops', async () => {
    startedInTheBackground();
    const post = vi.spyOn(api, 'post');
    const { unmount } = renderPage();
    await search();
    unmount();
    expect(following.stop).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('Past searches, with one under way', () => {
  const listed = (status, extra = {}) => ({ id: 9, description: DESCRIPTION, status, created_at: '2026-11-21T10:00:00',
                                            judged: 1, shortlisted: 1, ...extra });

  it('mark one running or failed', async () => {
    history = [listed('running'), listed('failed', { id: 8 }), listed('queued', { id: 7 })];
    renderPage();
    const list = await screen.findByRole('region', { name: 'Past searches' });
    expect([...list.querySelectorAll('li')].map(li => li.textContent.match(/· (running|failed)/)?.[1]))
      .toEqual(['running', 'failed', 'running']);
  });

  it('open one still running live, from where it stands', async () => {
    history = [listed('running')];
    saved[9] = { run: run('running', 4), profiles: [person(91, 'github:ada', 'Ada Lovelace', 'shortlist'),
                                                    person(92, 'github:bob', 'Bob Stone')] };
    renderPage();
    fireEvent.click(within(await screen.findByRole('region', { name: 'Past searches' })).getByText(DESCRIPTION));
    expect(await screen.findByRole('button', { name: /^Stop$/ })).toBeTruthy();
    expect([following.runId, following.after]).toEqual([9, 4]);
    // The one not yet judged is on the map.
    expect(screen.getByTestId('population-map').children).toHaveLength(2);
    await answers({ run: run('complete', 5), profiles: [person(92, 'github:bob', 'Bob Stone', 'passed')] });
    expect(await screen.findByText('Every person found has been read')).toBeTruthy();
  });

  it('open one asked to stop as stopping', async () => {
    history = [listed('stopping')];
    saved[9] = { run: run('stopping', 4), profiles: [] };
    renderPage();
    fireEvent.click(within(await screen.findByRole('region', { name: 'Past searches' })).getByText(DESCRIPTION));
    expect((await screen.findByRole('button', { name: /Stopping…/ })).disabled).toBe(true);
  });

  it('list one that has just ended, once it has', async () => {
    startedInTheBackground();
    renderPage();
    await search();
    history = [listed('complete')];
    await answers({ run: run('complete', 2), profiles: [] });
    fireEvent.click(await screen.findByRole('button', { name: /New search/ }));
    const list = await screen.findByRole('region', { name: 'Past searches' });
    expect(within(list).getByText(DESCRIPTION)).toBeTruthy();
  });
});

describe('a stop asked from another tab', () => {
  it('shows the search stopping', async () => {
    startedInTheBackground();
    renderPage();
    await search();
    await answers({ run: run('stopping', 2), profiles: [] });
    expect((await screen.findByRole('button', { name: /Stopping…/ })).disabled).toBe(true);
  });
});

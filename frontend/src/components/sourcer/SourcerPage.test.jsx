import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import SourcerPage from './SourcerPage';
import api from '../../services/api';

/* The whole page against a streamed run. fetch is faked with a real
 * ReadableStream of NDJSON, so the page is exercised the way the browser
 * exercises it: events arrive in chunks, are batched per frame, and every panel
 * fills from them. jsdom has no canvas and needs none; the map is a grid. */

const encoder = new TextEncoder();

const PLAN = {
  type: 'plan',
  plan: {
    req: { title: 'Backend Engineer', location: 'Boston', summary: '' },
    criteria: [{ id: 'c1', label: 'Python depth', kind: 'must' }, { id: 'c2', label: 'Shipped a product', kind: 'nice' }],
    filter: {}, github_queries: [], web_queries: [],
  },
};
const person = (pid, name, extra = {}) => ({ type: 'found', person: { pid, source: pid.split(':')[0], name, url: `https://example.com/${name}`, ...extra } });
const judged = (pid, verdict, filter_match, extra = {}) => ({
  type: 'judged', pid, verdict, filter_match, score: verdict === 'shortlist' ? 90 : 20, miss_reason: null, ms: 120, tokens: 400,
  criteria: [{ id: 'c1', value: 'Python services', level: verdict === 'shortlist' ? 'strong' : 'none' }],
  judgement: `${pid} judgement.`, ...extra,
});

const RUN = [
  PLAN,
  { type: 'pool', sources: { upload: 1, github: 2, web: 0 }, github_total: 5000 },
  person('upload:1', 'Maya Chen', { email: 'maya@example.com' }),
  person('github:ada', 'Ada Lovelace'),
  person('github:bob', 'Bob Stone'),
  judged('upload:1', 'shortlist', true),
  judged('github:ada', 'shortlist', false, { miss_reason: 'non_standard_title' }),
  judged('github:bob', 'passed', false),
  { type: 'stats', judged: 3, found: 3, per_sec: 1.5, elapsed_s: 62, tokens_in: 900, tokens_out: 100, cost_usd: null, github_total: 5000 },
  { type: 'saved', run_id: 9, profile_ids: { 'upload:1': 91, 'github:ada': 92, 'github:bob': 93 } },
  { type: 'done', stats: { judged: 3, found: 3, per_sec: 1.5, elapsed_s: 62, tokens_in: 900, tokens_out: 100, cost_usd: null, github_total: 5000 } },
];

/* NDJSON split awkwardly across chunks, as a network would. */
function streamOf(events) {
  const text = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  const cut = Math.floor(text.length / 3);
  const chunks = [text.slice(0, cut), text.slice(cut, 2 * cut), text.slice(2 * cut)];
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
      c.close();
    },
  });
}

function fakeServer(events = RUN) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/sourcer/runs') && options.method === 'POST') {
      return { ok: true, status: 200, body: streamOf(events) };
    }
    return { ok: true, status: 200, json: async () => ({ runs: [] }) };
  });
}

function renderPage() {
  return render(<MemoryRouter><SourcerPage /></MemoryRouter>);
}

async function search(text = 'Backend engineer in Boston, strong Python') {
  fireEvent.change(screen.getByLabelText('Who are you looking for?'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Find candidates/ }));
}

/* History goes through the axios client. Answer it by URL: `runs` for the list,
 * `saved` for GET /sourcer/runs/{id}. */
function fakeHistory({ runs = [], saved = {} } = {}) {
  return vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url === '/sourcer/runs') return { data: { runs: typeof runs === 'function' ? runs() : runs } };
    const id = Number(url.split('/').pop());
    if (saved[id]) return { data: saved[id] };
    throw { response: { status: 404, data: { detail: 'Run not found' } } };
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('resumate_hm_token', 'jwt-test');
  vi.restoreAllMocks();
  fakeHistory();
});
afterEach(cleanup);

describe('SourcerPage', () => {
  it('asks who to look for before anything runs', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Find candidates' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Find candidates/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/Describe who you're looking for/);
  });

  it('will not search nowhere', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Who are you looking for?'), { target: { value: 'Backend engineer' } });
    for (const label of ['Your uploads', 'GitHub', 'Web profiles']) fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole('button', { name: /Find candidates/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least one place/);
  });

  it('fills the tiles, the map and the panels from the stream', async () => {
    const server = fakeServer();
    renderPage();
    await search();

    await screen.findByText('Every person found has been read');
    const body = JSON.parse(server.mock.calls[0][1].body);
    expect(body).toEqual({ description: 'Backend engineer in Boston, strong Python', sources: { uploads: true, github: true, web: true } });

    // Tiles
    expect(within(screen.getByText('Shortlisted').parentElement).getByText('2')).toBeTruthy();
    expect(screen.getByText('1:02')).toBeTruthy();
    expect(screen.getByText('1.0k tokens')).toBeTruthy();
    // Header: the role, and honesty about how much of GitHub was read
    expect(screen.getByText(/Backend Engineer · Boston · 3 people/)).toBeTruthy();
    expect(screen.getByText(/GitHub reports 5,000 matches; this run reads 2 of them/)).toBeTruthy();
    // Map: one cell per person
    expect(screen.getByTestId('population-map').children).toHaveLength(3);
    // Filter comparison: one found by filter, one only by reading
    expect(within(screen.getByText('Read everyone').parentElement).getByText('+1')).toBeTruthy();
    // Judging now shows the last judged
    expect(within(screen.getByRole('region', { name: 'Judging now' })).getByText('Bob Stone')).toBeTruthy();
  });

  it('shows why a run could not start', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    renderPage();
    await search();
    expect(await screen.findByText(/Too many searches this hour/)).toBeTruthy();
    expect(screen.getByText('The search stopped early')).toBeTruthy();
  });

  it('shows a source warning with the run', async () => {
    fakeServer([PLAN, { type: 'warning', message: "GitHub's rate limit was reached; reading the people found so far." },
      { type: 'done', stats: {} }]);
    renderPage();
    await search();
    expect(await screen.findByText(/rate limit was reached/)).toBeTruthy();
  });

  it('stops when asked, and says what was kept', async () => {
    let signal;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      signal = options.signal;
      const body = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(`${JSON.stringify(PLAN)}\n${JSON.stringify(person('github:ada', 'Ada'))}\n`));
          signal.addEventListener('abort', () => c.error(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        },
      });
      return { ok: true, status: 200, body };
    });
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: /Stop/ }));
    expect(await screen.findByText('Stopped. Everyone judged so far is saved')).toBeTruthy();
    expect(signal.aborted).toBe(true);
  });

  it('goes back to the form for a new search, keeping the description', async () => {
    fakeServer();
    renderPage();
    await search('Staff engineer, strong Go');
    fireEvent.click(await screen.findByRole('button', { name: /New search/ }));
    expect(screen.getByLabelText('Who are you looking for?').value).toBe('Staff engineer, strong Go');
  });
});

describe('the shortlist', () => {
  it('opens from the top of the shortlist, best first, and closes on Escape', async () => {
    fakeServer();
    renderPage();
    await search();
    await screen.findByText('Every person found has been read');

    const top = screen.getByRole('region', { name: 'Top of shortlist' });
    expect(within(top).getByText('Maya C.')).toBeTruthy();
    fireEvent.click(within(top).getByRole('button', { name: /See all 2/ }));

    const dialog = screen.getByRole('dialog', { name: /Shortlist/ });
    expect(within(dialog).getAllByText(/Maya Chen|Ada Lovelace/).map(n => n.textContent)).toEqual(['Maya Chen', 'Ada Lovelace']);
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves someone through the saved profile id', async () => {
    fakeServer();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { profile: {} } });
    renderPage();
    await search();
    await screen.findByText('Every person found has been read');
    fireEvent.click(screen.getByRole('button', { name: /See all/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Save Ada Lovelace' }));
    expect(post).toHaveBeenCalledWith('/sourcer/profiles/92/status', { status: 'saved' });
    expect(await screen.findByRole('button', { name: 'Unsave Ada Lovelace' })).toBeTruthy();
  });

  it('waits for the run to be saved before offering actions', async () => {
    fakeServer(RUN.filter(e => e.type !== 'saved'));
    renderPage();
    await search();
    await screen.findByText('Every person found has been read');
    fireEvent.click(screen.getByRole('button', { name: /See all/ }));
    expect(screen.getByRole('button', { name: 'Save Maya Chen' }).disabled).toBe(true);
    expect(screen.getByText(/available once the run is saved/)).toBeTruthy();
  });
});

describe('outreach', () => {
  it('drafts a message to edit and copy; Escape closes only the draft', async () => {
    fakeServer();
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { subject: 'Your Python work', body: 'Hi Maya,\n\nWould you be open to a chat?', to: 'maya@example.com', profile_url: 'https://example.com/Maya Chen' },
    });
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    await search();
    await screen.findByText('Every person found has been read');
    fireEvent.click(screen.getByRole('button', { name: /See all/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft outreach to Maya Chen' }));

    expect(post).toHaveBeenCalledWith('/sourcer/profiles/91/draft-outreach');
    const draft = await screen.findByRole('dialog', { name: 'Outreach to Maya Chen' });
    const body = within(draft).getByLabelText('Message');
    await within(draft).findByDisplayValue('Your Python work');
    expect(body.value).toMatch(/open to a chat/);
    fireEvent.change(body, { target: { value: 'Edited.' } });

    fireEvent.click(within(draft).getByRole('button', { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith('Subject: Your Python work\n\nEdited.');
    expect(within(draft).getByRole('link', { name: /Open in email/ }).getAttribute('href')).toMatch(/^mailto:maya%40example\.com\?subject=Your%20Python%20work/);

    fireEvent.keyDown(draft, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Outreach/ })).toBeNull();
    expect(screen.getByRole('dialog', { name: /Shortlist/ })).toBeTruthy();
  });

  it('says so when a draft cannot be written', async () => {
    fakeServer();
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 500, data: {} } });
    renderPage();
    await search();
    await screen.findByText('Every person found has been read');
    fireEvent.click(screen.getByRole('button', { name: /See all/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft outreach to Ada Lovelace' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not draft a message/);
  });
});

describe('past searches', () => {
  const past = { id: 4, description: 'Designer in Berlin', status: 'complete', created_at: '2026-09-20T10:00:00', judged: 40, shortlisted: 3 };
  const savedRun = {
    run: { id: 4, description: 'Designer in Berlin', status: 'complete', plan: PLAN.plan, stats: { elapsed_s: 30 } },
    profiles: [{ id: 41, pid: 'web:lee', source: 'web', name: 'Lee Park', verdict: 'shortlist', score: 88, filter_match: false, miss_reason: 'career_pivot', criteria: [], judgement: 'Strong portfolio.' }],
  };

  it('are listed under the form and reopen as they ended', async () => {
    fakeHistory({ runs: [past], saved: { 4: savedRun } });
    renderPage();
    const history = await screen.findByRole('region', { name: 'Past searches' });
    expect(history.textContent).toMatch(/40 read · 3 shortlisted/);

    fireEvent.click(within(history).getByText('Designer in Berlin'));
    expect(await screen.findByText('Every person found has been read')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Judging now' })).getByText('Lee Park')).toBeTruthy();
    expect(within(screen.getByText('Read everyone').parentElement).getByText('+1')).toBeTruthy();
  });

  it('delete asks once more, in place', async () => {
    fakeHistory({ runs: [past] });
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: { deleted: 4 } });
    renderPage();
    const history = await screen.findByRole('region', { name: 'Past searches' });
    fireEvent.click(within(history).getByRole('button', { name: 'Delete "Designer in Berlin"' }));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(within(history).getByRole('button', { name: 'Confirm deleting "Designer in Berlin"' }));
    expect(del).toHaveBeenCalledWith('/sourcer/runs/4');
    await waitForGone(() => screen.queryByRole('region', { name: 'Past searches' }));
  });

  it('a stopped run is reopened from what the server saved', async () => {
    const text = 'Backend engineer in Boston, strong Python';
    let listed = [];
    fakeHistory({
      runs: () => listed,
      saved: { 5: { run: { id: 5, description: text, status: 'stopped', plan: PLAN.plan, stats: {} },
        profiles: [{ id: 51, pid: 'github:ada', source: 'github', name: 'Ada Lovelace', verdict: 'shortlist', score: 90, filter_match: false, criteria: [], judgement: 'Kept.' }] } },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      const body = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(`${JSON.stringify(PLAN)}\n`));
          options.signal.addEventListener('abort', () => {
            listed = [{ id: 5, description: text, status: 'stopped', created_at: '2026-09-27T10:00:00', judged: 1, shortlisted: 1 }];
            c.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        },
      });
      return { ok: true, status: 200, body };
    });
    renderPage();
    await search(text);
    fireEvent.click(await screen.findByRole('button', { name: /Stop/ }));
    // The saved partial run comes back with ids, so its people can be acted on.
    await screen.findAllByText('Kept.', {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: /See all/ }));
    expect(screen.getByRole('button', { name: 'Save Ada Lovelace' }).disabled).toBe(false);
  });
});

async function waitForGone(query) {
  for (let i = 0; i < 20 && query(); i += 1) await new Promise(r => setTimeout(r, 25));
  expect(query()).toBeNull();
}

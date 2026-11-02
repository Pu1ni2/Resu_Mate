import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import Dashboard from './Dashboard';

/* A screening run lived only in the page, so a refresh, or Back from another
 * page, meant screening again. Its id is in the address now, and a run named
 * there is opened from the server. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Engineer', skills: ['Python'], is_resume: true };
const RESULT = {
  candidate_id: 1, name: 'Ada', email: 'ada@x.com', ats_score: 90, verdict: 'Strong Fit',
  role_match: 90, skills_match: null, experience_match: null, education_match: null,
  matched_skills: [], missing_skills: [], assessed: ['role'],
};
const RUN = {
  run_id: 7, role: 'Engineer', total_screened: 1, results: [RESULT], shortlist: [RESULT],
  assessed: ['role'], excluded: 0, stats: { strong_fit: 1, good_fit: 0, consider: 0, no_match: 0 },
};
// As GET /pipeline/runs/7 sends it: when it ran, in the server's naive UTC.
const KEPT = { ...RUN, created_at: '2026-11-02T15:04:00' };

function Where() {
  return <output data-testid="where">{useLocation().search}</output>;
}

function open(entry) {
  mocks.app = {
    candidates: [ADA], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
  };
  render(<MemoryRouter initialEntries={[entry]}><Dashboard /><Where /></MemoryRouter>);
}

const where = () => screen.getByTestId('where').textContent;
const results = () => screen.findByRole('heading', { name: 'Shortlist — Engineer' });
const nav = name => fireEvent.click(within(screen.getByRole('navigation', { name: 'Hiring workspace' })).getByRole('button', { name }));
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

let server;
let fetchSpy;
const asked = path => fetchSpy.mock.calls.filter(([url]) => String(url).endsWith(path)).length;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  server = {
    '/api/pipeline/run': () => reply(RUN),
    '/api/pipeline/runs/7': () => reply(KEPT),
    '/api/pipeline/runs/8': () => reply({ detail: 'Screening run not found' }, 404),
  };
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const path = Object.keys(server).find(p => String(url).endsWith(p));
    return path ? server[path]() : reply({ statuses: {} });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function screenFor(role) {
  fireEvent.change(await screen.findByLabelText(/role you/i, {}, { timeout: 3000 }), { target: { value: role } });
  fireEvent.click(screen.getByRole('button', { name: /screen 1 resumes/i }));
}

describe('a screening run in the address', () => {
  it('is put there when it finishes, and opens from there after a refresh', async () => {
    open('/hiring?view=screening');
    await screenFor('Engineer');
    await results();
    expect(where()).toBe('?view=screening&run=7');

    cleanup();
    open('/hiring?view=screening&run=7');
    expect(screen.getByText('Opening the screening run…')).toBeTruthy();
    await results();
    expect(asked('/api/pipeline/runs/7')).toBe(1);
    // A run opened again says when it ran, read as UTC.
    const when = new Date('2026-11-02T15:04:00Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    expect(screen.getByText(`Screened ${when}.`)).toBeTruthy();
  });

  it('says when the run is no longer kept, and leads to a new one', async () => {
    open('/hiring?view=screening&run=8');
    expect((await screen.findByRole('alert')).textContent).toMatch(/isn't kept any more/);
    fireEvent.click(screen.getByRole('button', { name: 'Start a new run' }));
    expect(await screen.findByLabelText(/role you/i, {}, { timeout: 3000 })).toBeTruthy();
    expect(where()).toBe('?view=screening');
  });

  it('takes an id that is no number as not kept, without asking the server', async () => {
    open('/hiring?view=screening&run=abc');
    expect((await screen.findByRole('alert')).textContent).toMatch(/isn't kept any more/);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/api/pipeline/runs/'))).toBe(false);
  });

  it('can be tried again when it could not be reached', async () => {
    let calls = 0;
    server['/api/pipeline/runs/7'] = () => (calls++ ? reply(KEPT) : reply({}, 503));
    open('/hiring?view=screening&run=7');
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't be opened/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await results();
  });

  it('is left by Back, for the brief', async () => {
    open('/hiring?view=screening&run=7');
    await results();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText(/role you/i, {}, { timeout: 3000 })).toBeTruthy();
    expect(where()).toBe('?view=screening');
  });

  it('opens again from Screening in the menu after another view, without asking again', async () => {
    open('/hiring?view=screening&run=7');
    await results();
    nav('Candidates');
    expect(where()).toBe('?view=upload');
    nav('Screening');
    expect(where()).toBe('?view=screening&run=7');
    await results();
    expect(asked('/api/pipeline/runs/7')).toBe(1);
  });
});

describe('a run the server could not keep', () => {
  it('is shown all the same, with no id in the address', async () => {
    server['/api/pipeline/run'] = () => reply({ ...RUN, run_id: null });
    open('/hiring?view=screening');
    await screenFor('Engineer');
    await results();
    expect(where()).toBe('?view=screening');
  });
});

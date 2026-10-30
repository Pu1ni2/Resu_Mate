import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import { computeAnalytics } from '../context/analytics';

/* The dashboard's Insights view shows only what is real: no interview scores,
 * which interviews no longer have, but interviews completed, by role and the
 * recent ones, each opening its report; a failed load that says so; hidden
 * names kept hidden, with the same stand-ins as Candidates; and chart bars that
 * name their values. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', email: 'ada@x.com', predicted_role: 'Data Engineer', skills: ['Python', 'SQL'], total_experience_years: 4, is_resume: true };
const GRACE = { id: 2, name: 'Grace', email: 'grace@x.com', predicted_role: 'Designer', skills: ['Python', 'Figma'], total_experience_years: 8, is_resume: true };
const REPORT = { report: '## Interview Summary\n\nClear.', scores: [], timer: 600, transcript: [], mode: 'conversational' };
// One from before interviews stopped being scored.
const OLD = { ...REPORT, scores: [{ score: 8 }], mode: 'avatar' };
const RESULTS = [
  { email: 'grace@x.com', candidate_id: 2, candidate_name: 'Grace', role: 'Designer', timestamp: '2026-10-20T10:00:00', report: REPORT, scores: [] },
  { email: 'ada@x.com', candidate_id: 1, candidate_name: 'Ada', role: 'Data Engineer', timestamp: '2026-09-01T10:00:00', report: OLD, scores: [8] },
  { email: 'sam@x.com', candidate_id: 3, candidate_name: 'Sam', role: 'Designer', timestamp: '2026-08-01T10:00:00', report: REPORT, scores: [] },
];

function serve(results = RESULTS, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async url => (
    String(url).endsWith('get-all-interview-results')
      ? { ok, status: ok ? 200 : 500, json: async () => (ok ? { results, count: results.length } : { detail: 'Down' }) }
      : { ok: true, status: 200, json: async () => ({}) }
  ));
}

function open(overrides = {}) {
  const selected = overrides.selectedCandidates || [ADA, GRACE];
  mocks.app = {
    candidates: [ADA, GRACE], selectedIds: selected.map(c => c.id), selectedCandidates: selected,
    uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: computeAnalytics(selected),
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
  render(<MemoryRouter initialEntries={['/hiring?view=analytics']}><Dashboard /></MemoryRouter>);
  return mocks.app;
}

const statValue = label => screen.getByText(label, { selector: '.clean-stat-label' }).parentElement.querySelector('.clean-stat-value').textContent;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the interviews on Insights', () => {
  it('show no score, even from an interview that was scored', async () => {
    serve();
    open();
    expect(await screen.findByText('Recent Interviews')).toBeTruthy();
    for (const gone of ['Avg Score', 'High Performers', 'Needs Improvement', 'Score Distribution', '8.0']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(statValue('Completed')).toBe('3');
  });

  it('count the interviews by role', async () => {
    serve();
    open();
    await screen.findByText('By Role');
    expect(statValue('Roles')).toBe('2');
    const byRole = screen.getByText('By Role').nextElementSibling;
    expect([...byRole.querySelectorAll('.clean-list-row')].map(row => row.textContent)).toEqual(['Designer2', 'Data Engineer1']);
  });

  it('open a recent interview\'s report, and come back', async () => {
    serve();
    open();
    fireEvent.click(await screen.findByRole('button', { name: /^Grace Designer/ }));
    expect(screen.getByRole('heading', { name: 'Interview Completed' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /back to analytics/i }));
    expect(screen.getByText('Recent Interviews')).toBeTruthy();
  });

  it('say what kind each recent interview was', async () => {
    serve();
    open();
    await screen.findByText('Recent Interviews');
    expect(screen.getAllByText('Voice interview')).toHaveLength(2);
    expect(screen.getAllByText('Avatar interview')).toHaveLength(1);
  });

  it('say a failed load failed, and try again', async () => {
    const fetcher = serve(RESULTS, false);
    open();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be loaded/);
    expect(screen.queryByText('No completed interviews yet')).toBeNull();

    fetcher.mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('No completed interviews yet')).toBeTruthy());
  });
});

describe('hidden names on Insights', () => {
  it('are the same stand-ins as on Candidates, by each person\'s place in the whole list', async () => {
    serve();
    open({ anonymize: true, getDisplayName: (c, i) => `Candidate ${i + 1}`, selectedCandidates: [GRACE] });
    await screen.findByText('Recent Interviews');
    // Grace is second in the list, so she is Candidate 2 here too.
    expect(screen.getByText('Candidate 2', { selector: '.clean-exp-name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Candidate 2 Designer/ })).toBeTruthy();
    // Sam isn't in the uploads, so there is no stand-in to give him.
    expect(screen.getByRole('button', { name: /^Candidate Designer/ })).toBeTruthy();
    expect(screen.queryByText('Grace')).toBeNull();
    expect(screen.queryByText('Sam')).toBeNull();
  });
});

describe('the charts on Insights', () => {
  it('name each bar with its value', async () => {
    serve([]);
    open();
    expect(screen.getByRole('img', { name: 'Ada · 4 years of experience' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Grace · 8 years of experience' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Python · 2 of 2 selected candidates (100%)' })).toBeTruthy();
    await screen.findByText('No completed interviews yet');
  });
});

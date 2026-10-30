import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';

/* What a screening run takes from the Candidates page: every résumé that is
 * ready, or, with candidates selected, the ready ones among them. Selecting
 * used to do nothing for screening; the run took everyone. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Engineer', skills: ['Python'], is_resume: true };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Designer', skills: ['Figma'], is_resume: true };
const BEA = { id: 3, name: 'Bea', skills: [], is_resume: true, analysis_failed: true };
const NOTE = { id: 4, name: 'Shopping list', skills: [], is_resume: false };
const LIN = { id: 5, name: 'Lin', predicted_role: 'Engineer', skills: ['Go'], is_resume: true };

const RUN = {
  role: 'Engineer', total_screened: 2, results: [], shortlist: [], assessed: ['role'], excluded: 0,
  stats: { strong_fit: 1, good_fit: 1, consider: 0, no_match: 0 },
};

function open(overrides = {}) {
  mocks.app = {
    candidates: [ADA, GRACE, BEA, NOTE, LIN], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
  render(<MemoryRouter initialEntries={['/hiring']}><Dashboard /></MemoryRouter>);
}

let fetchSpy;
const runBody = () => {
  const call = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/pipeline/run'));
  return call && JSON.parse(call[1].body);
};

async function runFor(role, button) {
  fireEvent.change(await screen.findByLabelText(/role you/i), { target: { value: role } });
  fireEvent.click(screen.getByRole('button', { name: button }));
  await waitFor(() => expect(runBody()).toBeTruthy());
  return runBody();
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => ({
    ok: true, status: 200, json: async () => (String(url).includes('/api/pipeline/run') ? RUN : {}),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('screening from the Candidates page', () => {
  it('takes every résumé that is ready when nobody is selected', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Screen candidates' }));
    // Not Bea, whose analysis failed, nor the shopping list.
    const body = await runFor('Engineer', /screen 3 resumes/i);
    expect(body.candidate_ids).toBeUndefined();
  });

  it('takes only the selected résumés that are ready', async () => {
    open({ selectedIds: [1, 2, 3, 4] });
    fireEvent.click(screen.getByRole('button', { name: 'Screen selected (2)' }));
    const body = await runFor('Engineer', /screen 2 resumes/i);
    expect(body.candidate_ids).toEqual([1, 2]);
  });

  it('says when a selection has nothing to screen, and leads back to it', () => {
    open({ selectedIds: [3, 4] });
    fireEvent.click(screen.getByRole('button', { name: 'Screen selected (0)' }));
    expect(screen.getByRole('heading', { name: 'No résumés in this selection' })).toBeTruthy();
    expect(screen.queryByLabelText(/role you/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Candidates' }));
    expect(screen.getByRole('heading', { name: 'The collection 5' })).toBeTruthy();
  });
});

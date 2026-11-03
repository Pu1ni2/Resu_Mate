import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import CandidateFocus from './CandidateFocus';
import { computeAnalytics } from '../context/analytics';

/* The sample résumé offered for trying ResuMate was a candidate like any
 * other: unmarked, counted in Insights, and offered an interview. The server
 * says which record is the sample (is_sample) and refuses its interview. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const RILEY = { id: 1, name: 'Riley Samplewood', predicted_role: 'Product Designer', skills: ['Figma'], is_resume: true, total_experience_years: 6, is_sample: true };
const ADA = { id: 2, name: 'Ada', predicted_role: 'Engineer', skills: ['Python'], is_resume: true, total_experience_years: 4 };
const KEPT = { evaluation_id: 1, role: 'Designer', level: 'Senior', anonymized: false, report: 'A fit.', created_at: '2026-11-02T15:04:00' };

function app(overrides = {}) {
  return {
    candidates: [RILEY, ADA], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  // Each file has a kept evaluation, so its interview would be offered.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => ({
    ok: true, status: 200,
    json: async () => (/\/candidates\/\d+\/evaluations$/.test(String(url)) ? { evaluations: [KEPT] } : { results: [] }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the sample résumé', () => {
  it('is marked on its card, and no one else is', () => {
    mocks.app = app();
    render(<MemoryRouter initialEntries={['/hiring?view=upload']}><Dashboard /></MemoryRouter>);
    const names = [...document.querySelectorAll('.candidate-name')];
    const marked = names.filter(h => [...h.parentElement.querySelectorAll('.badge')].some(b => b.textContent === 'Sample'));
    expect(marked.map(h => h.textContent)).toEqual(['Riley Samplewood']);
  });

  it('is left out of the Insights figures', () => {
    const figures = computeAnalytics([RILEY, ADA]);
    expect(figures.total).toBe(1);
    expect(figures.avgExperience).toBe('4.0');
    expect(figures.topSkills.map(s => s.name)).toEqual(['Python']);
  });

  it('is marked in its file, and offers no interview', async () => {
    mocks.app = app();
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    expect(screen.getByText('CANDIDATE / 001 · SAMPLE RÉSUMÉ')).toBeTruthy();
    await screen.findByRole('button', { name: /Export evaluation/ });
    const create = screen.getByRole('button', { name: 'Create interview' });
    expect(create.disabled).toBe(true);
    expect(create.getAttribute('title')).toBe("The sample résumé is for trying ResuMate, so it can't be invited to an interview.");
  });

  it("leaves anyone else's interview as it was", async () => {
    mocks.app = app();
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=2']}><CandidateFocus /></MemoryRouter>);
    expect(screen.getByText('CANDIDATE / 002')).toBeTruthy();
    await screen.findByRole('button', { name: /Export evaluation/ });
    expect(screen.getByRole('button', { name: 'Create interview' }).disabled).toBe(false);
  });
});

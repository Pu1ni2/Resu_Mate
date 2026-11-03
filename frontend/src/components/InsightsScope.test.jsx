import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';

/* Insights showed figures for the selected candidates and figures for every
 * interview in the workspace side by side, and nothing said which was which. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Engineer', skills: ['Python'], is_resume: true, total_experience_years: 5 };
const BEA = { id: 2, name: 'Bea', predicted_role: 'Designer', skills: ['Figma'], is_resume: true, total_experience_years: 3 };
const INTERVIEW = { candidate_name: 'Cy', email: 'cy@x.com', role: 'Engineer', timestamp: '2026-11-02T15:04:00', report: {} };

function open(selected) {
  mocks.app = {
    candidates: [ADA, BEA], selectedIds: selected.map(c => c.id), selectedCandidates: selected, uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(),
    analytics: { total: selected.length, avgExperience: '4.0', totalSkills: 2, topSkills: [], topSkillsAllEqual: false, roleDistribution: [], levelDistribution: [] },
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
  };
  render(<MemoryRouter initialEntries={['/hiring?view=analytics']}><Dashboard /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => ({
    ok: true, status: 200,
    json: async () => (String(url).endsWith('/api/chat/get-all-interview-results') ? { results: [INTERVIEW] } : {}),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what the Insights figures cover', () => {
  it('says the candidate figures are for the selection', () => {
    open([ADA, BEA]);
    expect(screen.getByText("For the 2 candidates you've selected on Candidates.")).toBeTruthy();
    expect(screen.getByText('years, where known')).toBeTruthy();
    expect(screen.getByText('across the selected')).toBeTruthy();
  });

  it('says "the candidate" for one', () => {
    open([ADA]);
    expect(screen.getByText("For the candidate you've selected on Candidates.")).toBeTruthy();
  });

  it('says the interview figures are for every interview, whoever is selected', async () => {
    open([ADA]);
    expect(await screen.findByRole('heading', { name: 'All your interviews' })).toBeTruthy();
    expect(screen.getByText('Every finished interview in your workspace, whoever is selected.')).toBeTruthy();
  });

  it('names the interview figures the same with nobody selected', async () => {
    open([]);
    expect(await screen.findByRole('heading', { name: 'All your interviews' })).toBeTruthy();
    expect(screen.queryByText(/you've selected on Candidates/)).toBeNull();
  });
});

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import { knownYears } from '../services/experience';
import { jarvisSummary } from './studio/AskJarvis';

/* Years of experience the résumé doesn't give were shown, sorted and told to
 * Jarvis as 0, so a résumé the analysis couldn't read had "0y". */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Engineer', skills: ['Python'], is_resume: true, total_experience_years: 5 };
const BEA = { id: 2, name: 'Bea', predicted_role: 'Designer', skills: ['Figma'], is_resume: true, total_experience_years: null };
const CY = { id: 3, name: 'Cy', predicted_role: 'Student', skills: ['Go'], is_resume: true, total_experience_years: 0 };

function open(entry, selected = []) {
  mocks.app = {
    candidates: [BEA, ADA, CY], selectedIds: selected.map(c => c.id), selectedCandidates: selected, uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(),
    analytics: { total: selected.length, avgExperience: '2.5', totalSkills: 2, topSkills: [], topSkillsAllEqual: false, roleDistribution: [], levelDistribution: [] },
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
  };
  render(<MemoryRouter initialEntries={[entry]}><Dashboard /></MemoryRouter>);
}

const cardNames = () => screen.queryAllByRole('heading', { level: 3 })
  .filter(h => h.classList.contains('candidate-name'))
  .map(h => h.textContent);

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [] }) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('years of experience', () => {
  it('are a number, or unknown', () => {
    expect(knownYears(5)).toBe(5);
    expect(knownYears(0)).toBe(0);
    for (const unknown of [null, undefined, '', '5', NaN, -1]) expect(knownYears(unknown)).toBeNull();
  });

  it('show as "—" in Insights, with no bar, and 0 as 0', () => {
    open('/hiring?view=analytics', [ADA, BEA, CY]);
    expect(screen.getByRole('img', { name: 'Ada · 5 years of experience' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Bea · experience not known' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Cy · 0 years of experience' })).toBeTruthy();
    const shown = [...document.querySelectorAll('.clean-exp-years')].map(el => el.textContent);
    expect(shown).toEqual(['5y', '—', '0y']);
  });

  it('sort with unknown last, after none', () => {
    open('/hiring?view=upload');
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort candidates' }), { target: { value: 'experience' } });
    expect(cardNames()).toEqual(['Ada', 'Cy', 'Bea']);
  });

  it('are told to Jarvis as unknown, not 0', () => {
    expect(jarvisSummary([ADA, BEA, CY]).map(c => c.total_experience_years)).toEqual([5, null, 0]);
  });
});

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';

/* The dashboard's Candidates view: the collection's counts, the search and
 * order of the cards, a search that matches nobody, hidden names kept hidden
 * from the search too, each file's number, and the empty and loading states. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Engineer', skills: ['Python'], total_experience_years: 4, is_resume: true };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Designer', skills: ['Figma'], total_experience_years: 9, is_resume: true };
const BEA = { id: 3, name: 'Bea', skills: [], is_resume: true, analysis_failed: true };
const NOTE = { id: 4, name: 'Shopping list', skills: [], is_resume: false };

function open(overrides = {}) {
  mocks.app = {
    candidates: [ADA, GRACE], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
  render(<MemoryRouter initialEntries={['/hiring']}><Dashboard /></MemoryRouter>);
  return mocks.app;
}

const names = () => screen.queryAllByRole('heading', { level: 3 })
  .filter(h => h.classList.contains('candidate-name'))
  .map(h => h.textContent);
const search = text => fireEvent.change(screen.getByRole('searchbox', { name: 'Search candidates' }), { target: { value: text } });
const count = label => screen.getByText(label).parentElement.querySelector('strong').textContent;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the collection', () => {
  it('counts the files, the résumés ready to review, and the selection', () => {
    open({ candidates: [ADA, GRACE, BEA, NOTE], selectedIds: [1] });
    expect(count('YOUR COLLECTION')).toBe('04');
    // Not the one that isn't a résumé, nor the one whose analysis failed.
    expect(count('READY TO REVIEW')).toBe('02');
    expect(count('IN YOUR SELECTION')).toBe('01');
    expect(screen.getByRole('heading', { name: 'The collection 4' })).toBeTruthy();
  });

  it('marks a file that is not a résumé, and only that one', () => {
    open({ candidates: [NOTE, { ...ADA, is_resume: undefined }] });
    expect(screen.getAllByText('Not a Resume')).toHaveLength(1);
  });

  it('numbers each file by its place in the whole list, also when searching', () => {
    open();
    search('Grace');
    const card = screen.getByRole('heading', { name: 'Grace' }).closest('.candidate-card');
    expect(card.querySelector('.sd-file-number').textContent).toBe('CANDIDATE FILE 002');
  });
});

describe('the search and order', () => {
  it('finds candidates by name, role or skill, and counts them', () => {
    open();
    search('figma');
    expect(names()).toEqual(['Grace']);
    expect(screen.getByText('1 file')).toBeTruthy();
    search('engineer');
    expect(names()).toEqual(['Ada']);
    search('');
    expect(names()).toEqual(['Ada', 'Grace']);
    expect(screen.getByText('2 files')).toBeTruthy();
  });

  it('says when nobody matches, and clears the search', () => {
    open();
    search('zzz');
    expect(names()).toEqual([]);
    expect(screen.getByText(/No candidates match “zzz”/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(names()).toEqual(['Ada', 'Grace']);
  });

  it('orders by name or by experience, and back to the original order', () => {
    open({ candidates: [GRACE, ADA] });
    const order = screen.getByRole('combobox', { name: 'Sort candidates' });
    fireEvent.change(order, { target: { value: 'name' } });
    expect(names()).toEqual(['Ada', 'Grace']);
    fireEvent.change(order, { target: { value: 'experience' } });
    expect(names()).toEqual(['Grace', 'Ada']);
    fireEvent.change(order, { target: { value: 'recent' } });
    expect(names()).toEqual(['Grace', 'Ada']);
  });

  it('with names hidden, searches only the stand-in names', () => {
    open({ anonymize: true, getDisplayName: (c, i) => `Candidate ${i + 1}` });
    search('Ada');
    expect(names()).toEqual([]);
    search('Candidate 2');
    expect(names()).toEqual(['Candidate 2']);
  });
});

describe('before there are candidates', () => {
  it('shows an open desk, and the way to the first upload', () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    open({ candidates: [] });
    const desk = screen.getByRole('heading', { name: 'Your next great hire starts here.' }).closest('section');
    fireEvent.click(within(desk).getByRole('button', { name: 'Upload your first resume' }));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /try a made-up sample/i })).toBeTruthy();
  });

  it('says it is loading, rather than showing an empty desk', () => {
    open({ candidates: [], loading: true });
    expect(screen.getByRole('status').textContent).toBe('Opening your candidate collection…');
    expect(screen.queryByRole('heading', { name: 'Your next great hire starts here.' })).toBeNull();
  });
});

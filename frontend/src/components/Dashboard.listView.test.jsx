import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import Dashboard from './Dashboard';

/* The collection as a list, for a big one: a row a person, where the cards
 * took a screen for three. The choice is remembered in this browser. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = {
  id: 1, name: 'Ada Lovelace', predicted_role: 'Engineer', total_experience_years: 7, experience_level: 'Senior',
  location: 'London', skills: ['Python', 'Maths', 'Notes', 'Looms'], is_resume: true,
};
const BEA = { id: 2, name: 'Bea Hart', predicted_role: 'Designer', total_experience_years: null, skills: [], is_resume: true };

function open(overrides = {}) {
  mocks.app = {
    candidates: [ADA, BEA], candidatesStatus: 'loaded', selectedIds: [1], selectedCandidates: [ADA], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={['/hiring']}>
      <Routes>
        <Route path="/hiring" element={<Dashboard />} />
        <Route path="/hiring/focus" element={<p>The candidate file</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return mocks.app;
}

const switchTo = name => fireEvent.click(within(screen.getByRole('group', { name: 'Show the collection as' })).getByRole('button', { name }));
const table = () => screen.queryByRole('table', { name: 'The collection, a row a person' });

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the collection as a list', () => {
  it('is cards until the list is chosen, and the switch says which is on', () => {
    open();
    expect(table()).toBeNull();
    const group = screen.getByRole('group', { name: 'Show the collection as' });
    expect(within(group).getByRole('button', { name: 'Cards' }).getAttribute('aria-pressed')).toBe('true');
    switchTo('List');
    expect(table()).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'Cards' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('is remembered in this browser', () => {
    open();
    switchTo('List');
    cleanup();
    open();
    expect(table()).toBeTruthy();
    switchTo('Cards');
    cleanup();
    open();
    expect(table()).toBeNull();
  });

  it('gives each person a row: who, role, experience, level, where, skills', () => {
    open();
    switchTo('List');
    const [, ada, bea] = within(table()).getAllByRole('row');
    expect(within(ada).getAllByRole('cell').map(cell => cell.textContent.trim()))
      .toEqual(['', 'Engineer', '7y', 'Senior', 'London', 'Python, Maths, Notes', '']);
    expect(within(ada).getByRole('rowheader').textContent).toBe('Ada Lovelace');
    // Unknown experience stays unknown, as on the cards.
    expect(within(bea).getAllByRole('cell')[2].textContent).toBe('—');
  });

  it('selects, opens the file and deletes from the row', () => {
    const app = open();
    switchTo('List');
    const select = screen.getByRole('checkbox', { name: 'Select Bea Hart' });
    expect(screen.getByRole('checkbox', { name: 'Select Ada Lovelace' }).checked).toBe(true);
    fireEvent.click(select);
    expect(app.toggleSelection).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Bea Hart' }));
    expect(app.deleteCandidate).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open candidate file for Ada Lovelace' }));
    expect(screen.getByText('The candidate file')).toBeTruthy();
  });

  it('names people as Hide names does', () => {
    open({ getDisplayName: (_c, i) => `Candidate ${i + 1}` });
    switchTo('List');
    expect(within(table()).getAllByRole('rowheader').map(h => h.textContent)).toEqual(['Candidate 1', 'Candidate 2']);
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
  });
});

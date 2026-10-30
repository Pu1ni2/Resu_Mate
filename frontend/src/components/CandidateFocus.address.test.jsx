import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* The candidate file opens the candidate a link names (/hiring/focus?candidate=ID),
 * as the dashboard's cards and its Interviews view link to it, also when the
 * candidate list arrives after the page; and going back to the list leaves the
 * address, so the same file doesn't open again. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Backend Engineer', skills: ['Go'], is_resume: true };

function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.pathname + location.search}</p>;
}

const page = path => (
  <MemoryRouter initialEntries={[path]}>
    <CandidateFocus />
    <Address />
  </MemoryRouter>
);

// The list of files, as opposed to one file open.
const theList = () => screen.queryByRole('heading', { name: 'Open a file. See the whole story.' });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA, GRACE], anonymize: false, getDisplayName: c => c.name };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the candidate file, from a link', () => {
  it('opens the candidate the address names', () => {
    render(page('/hiring/focus?candidate=2'));
    expect(screen.getByRole('heading', { name: 'Grace' })).toBeTruthy();
    expect(theList()).toBeNull();
  });

  it('opens it when the candidate list arrives after the page', () => {
    mocks.app = { ...mocks.app, candidates: [] };
    const { rerender } = render(page('/hiring/focus?candidate=2'));
    expect(theList()).toBeTruthy();

    mocks.app = { ...mocks.app, candidates: [ADA, GRACE] };
    rerender(page('/hiring/focus?candidate=2'));
    expect(screen.getByRole('heading', { name: 'Grace' })).toBeTruthy();
  });

  it('goes back to the list, and the address no longer opens the file', () => {
    render(page('/hiring/focus?candidate=2'));
    fireEvent.click(screen.getByRole('button', { name: 'All candidate files' }));
    expect(theList()).toBeTruthy();
    expect(screen.getByTestId('address').textContent).toBe('/hiring/focus');
  });

  it('shows the list for a candidate it does not have', () => {
    render(page('/hiring/focus?candidate=99'));
    expect(theList()).toBeTruthy();
  });
});

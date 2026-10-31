import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import CandidateFocus from './CandidateFocus';

/* An empty candidate list read as having no candidates, whatever the reason:
 * before the list had come from the server, and when it couldn't be reached,
 * the Candidates page showed its open desk, screening said there was nothing
 * to screen, and the candidate file asked for a first résumé. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

function app(candidatesStatus) {
  return {
    candidates: [], candidatesStatus, selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn(), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
  };
}

const PAGES = [
  ['the Candidates page', '/hiring', () => <Dashboard />],
  ['screening', '/hiring?view=screening', () => <Dashboard />],
  ['the candidate file', '/hiring/focus', () => <CandidateFocus />],
];

function open(status, path, page) {
  mocks.app = app(status);
  return render(<MemoryRouter initialEntries={[path]}>{page()}</MemoryRouter>);
}

// What each page says when there is no one yet.
const NO_ONE_YET = /Your next great hire|Nothing to screen yet|Upload a résumé to bring/;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an empty candidate list', () => {
  it.each(PAGES)('is said to be opening on %s, before the server has answered', (_, path, page) => {
    const { container } = open('loading', path, page);
    expect(screen.getByText(/^Opening your candidate (collection|files)…$/).closest('[role="status"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(NO_ONE_YET);
  });

  it.each(PAGES)("says it couldn't be loaded on %s, and tries again", (_, path, page) => {
    const { container } = open('failed', path, page);
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't be loaded\.\s*Check your connection and try again\./);
    expect(container.textContent).not.toMatch(NO_ONE_YET);
    const asked = mocks.app.loadCandidates.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.app.loadCandidates).toHaveBeenCalledTimes(asked + 1);
  });

  it.each(PAGES)('means no one yet on %s once it has loaded', (_, path, page) => {
    const { container } = open('loaded', path, page);
    expect(container.textContent).toMatch(NO_ONE_YET);
    expect(screen.queryByText(/^Opening your candidate/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

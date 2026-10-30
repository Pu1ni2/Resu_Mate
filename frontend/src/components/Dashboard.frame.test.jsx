import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

import Dashboard from './Dashboard';

/* The dashboard in the workspace frame: the view is in the address, so it can
 * be linked to and Back returns to the one before; the frame's heading follows
 * the view; Jarvis opens from the sidebar over any view; and the account sits
 * at the sidebar's foot. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

function Address() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="address">{location.pathname + location.search}</p>
      <button onClick={() => navigate(-1)}>Go back</button>
    </>
  );
}

function open(path = '/hiring', overrides = {}) {
  mocks.app = {
    candidates: [], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan Lee', company: 'Fieldwork', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/hiring" element={<><Dashboard /><Address /></>} />
        <Route path="/hiring/login" element={<p>The sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return mocks.app;
}

const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const address = () => screen.getByTestId('address').textContent;
const current = name => screen.getByRole('button', { name }).getAttribute('aria-current');

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  // Jarvis greets through the speech API, which jsdom does not have.
  window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the dashboard in the workspace frame', () => {
  it('opens the view the address names, under its own heading, with its section marked', () => {
    open('/hiring?view=interviews');
    expect(heading()).toBe('Beyond the résumé.');
    expect(current('Interviews')).toBe('page');
    expect(current('Candidates')).toBeNull();
  });

  it('opens Candidates for a view it does not have', () => {
    open('/hiring?view=nothing');
    expect(heading()).toBe('A place for possibility.');
    expect(current('Candidates')).toBe('page');
  });

  it('puts the chosen view in the address, and Back returns to the one before', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));
    expect(address()).toBe('/hiring?view=analytics');
    expect(heading()).toBe('The bigger picture.');

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(address()).toBe('/hiring');
    expect(heading()).toBe('A place for possibility.');
  });

  it('opens the candidate chat from the sidebar, and marks it', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Candidate chat' }));
    expect(address()).toBe('/hiring?view=chat');
    expect(heading()).toBe('A second perspective.');
    expect(current('Candidate chat')).toBe('page');
  });

  it('opens Jarvis from the sidebar over any view', async () => {
    open('/hiring?view=interviews');
    fireEvent.click(screen.getByRole('button', { name: 'Ask Jarvis' }));
    expect(await screen.findByRole('dialog', { name: 'Jarvis, the hiring copilot' }, { timeout: 5000 })).toBeTruthy();
  });
});

describe('the account, at the sidebar\'s foot', () => {
  it('names the manager and their company, and signs them out', () => {
    const app = open();
    expect(screen.getByText('Morgan Lee')).toBeTruthy();
    expect(screen.getByText('Fieldwork')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(app.logoutHiringManager).toHaveBeenCalled();
    expect(screen.getByText('The sign-in page')).toBeTruthy();
  });

  it('asks for the password before deleting the account', () => {
    open('/hiring?view=analytics');
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete your account?' })).toBeTruthy();
    expect(screen.getByLabelText('Your password')).toBeTruthy();
  });
});

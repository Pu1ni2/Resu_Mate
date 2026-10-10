import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import Dashboard from './Dashboard';

/* The sidebar, the anonymize switch, the upload area and the candidate cards
 * were divs with onClick: none could be reached or used without a mouse, and a
 * screen reader read them as plain text. The card arrows, Delete and the chat's
 * Send were icons with no name. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', skills: ['Python'], predicted_role: 'Engineer', is_resume: true };

function open(overrides = {}) {
  mocks.app = {
    candidates: [], selectedIds: [], selectedCandidates: [], uploadProgress: {}, loading: false,
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
        <Route path="/" element={<p>The home page</p>} />
        <Route path="/hiring" element={<Dashboard />} />
        <Route path="/hiring/sourcer" element={<p>The sourcer</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return mocks.app;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the sidebar', () => {
  it('switches tabs from the keyboard, and says which one is open', () => {
    open();
    const analytics = screen.getByRole('button', { name: 'Analytics' });
    expect(screen.getByRole('button', { name: 'Upload' }).getAttribute('aria-current')).toBe('page');
    expect(analytics.tabIndex).toBe(0);

    fireEvent.keyDown(analytics, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Analytics' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Upload' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens the other pages as links', () => {
    open();
    fireEvent.keyDown(screen.getByRole('link', { name: 'Find Candidates' }), { key: 'Enter' });
    expect(screen.getByText('The sourcer')).toBeTruthy();
  });

  it('goes home from the keyboard', () => {
    open();
    fireEvent.keyDown(screen.getByRole('link', { name: 'Home' }), { key: ' ' });
    expect(screen.getByText('The home page')).toBeTruthy();
  });
});

describe('the anonymize switch', () => {
  it('is a switch that says whether it is on, and Space flips it', () => {
    const app = open();
    const toggle = screen.getByRole('switch', { name: 'Anonymize candidates' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(app.setAnonymize).toHaveBeenCalledWith(true);
  });
});

describe('the upload area', () => {
  it('is a button named by its own text, and Enter opens the file picker', () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    open();
    const zone = screen.getByRole('button', { name: /drop resumes here or click to upload.*max 5mb/i });
    fireEvent.keyDown(zone, { key: 'Enter' });
    expect(pick).toHaveBeenCalledTimes(1);
  });
});

describe('a candidate card', () => {
  it('has a real checkbox named after the candidate, and one press selects once', () => {
    const app = open({ candidates: [ADA] });
    const box = screen.getByRole('checkbox', { name: 'Select Ada' });
    expect(box.checked).toBe(false);
    fireEvent.click(box); // what Space on a checkbox does
    expect(app.toggleSelection).toHaveBeenCalledTimes(1);
    expect(app.toggleSelection).toHaveBeenCalledWith(1);
  });

  it('shows a selected candidate as checked', () => {
    open({ candidates: [ADA], selectedIds: [1] });
    expect(screen.getByRole('checkbox', { name: 'Select Ada' }).checked).toBe(true);
  });

  it('still selects when the mouse clicks the card', () => {
    const app = open({ candidates: [ADA] });
    fireEvent.click(screen.getByRole('heading', { name: 'Ada' }));
    expect(app.toggleSelection).toHaveBeenCalledWith(1);
  });

  it('names Delete after the candidate, and deleting does not select', () => {
    const app = open({ candidates: [ADA] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Ada' }));
    expect(app.deleteCandidate).toHaveBeenCalledWith(1);
    expect(app.toggleSelection).not.toHaveBeenCalled();
  });

  it('names the arrows that scroll the cards', () => {
    open({ candidates: [ADA] });
    expect(screen.getByRole('button', { name: 'Scroll candidates left' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scroll candidates right' })).toBeTruthy();
  });
});

describe('the AI chat', () => {
  it('labels its message box and its send button', () => {
    open({ candidates: [ADA], selectedIds: [1], selectedCandidates: [ADA] });
    fireEvent.keyDown(screen.getByRole('button', { name: 'AI Chat' }), { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Message the AI assistant' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });
});

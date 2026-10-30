import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import Dashboard from './Dashboard';

/* The sidebar, the anonymize switch (now Hide names), the upload area and the
 * candidate cards were divs with onClick: none could be reached or used without
 * a mouse, and a screen reader read them as plain text. The card arrows, Delete
 * and the chat's Send were icons with no name. */

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
        <Route path="/hiring/focus" element={<p>The candidate file</p>} />
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

// The sections, the switch and the links are native buttons and links now, so
// the keyboard reaches and presses them by itself: a click is what Enter or
// Space on them does.
describe('the sidebar', () => {
  it('switches views with native buttons, and says which one is open', () => {
    open();
    const insights = screen.getByRole('button', { name: 'Insights' });
    expect(screen.getByRole('button', { name: 'Candidates' }).getAttribute('aria-current')).toBe('page');
    expect(insights.tabIndex).toBe(0);

    fireEvent.click(insights);
    expect(screen.getByRole('button', { name: 'Insights' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Candidates' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens the other pages as links', () => {
    open();
    fireEvent.click(screen.getByRole('link', { name: 'Find Candidates' }));
    expect(screen.getByText('The sourcer')).toBeTruthy();
  });

  it('goes home with a native link', () => {
    open();
    fireEvent.click(screen.getByRole('link', { name: 'ResuMate homepage' }));
    expect(screen.getByText('The home page')).toBeTruthy();
  });
});

describe('the Hide names switch', () => {
  it('is a switch named by its words, that says whether it is on', () => {
    const app = open();
    const toggle = screen.getByRole('switch', { name: 'Hide names' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
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

  // The cards are a grid now, with nothing to scroll; each opens its file.
  it('opens the candidate file without changing the selection', () => {
    const app = open({ candidates: [ADA] });
    fireEvent.click(screen.getByRole('button', { name: 'Open candidate file for Ada' }));
    expect(screen.getByText('The candidate file')).toBeTruthy();
    expect(app.toggleSelection).not.toHaveBeenCalled();
  });
});

describe('the candidate chat', () => {
  it('labels its message box and its send button', () => {
    open({ candidates: [ADA], selectedIds: [1], selectedCandidates: [ADA] });
    fireEvent.click(screen.getByRole('button', { name: 'Candidate chat' }));
    expect(screen.getByRole('textbox', { name: 'Message the AI assistant' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });
});

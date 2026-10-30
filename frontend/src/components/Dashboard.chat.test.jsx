import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import Dashboard from './Dashboard';

/* The dashboard's candidate chat: a conversation a screen reader follows as
 * replies arrive, a message box that says what it is for, and, with nobody
 * selected, the way to Candidates. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Engineer', skills: ['Python'], is_resume: true };

function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.search}</p>;
}

function open(overrides = {}) {
  mocks.app = {
    candidates: [ADA], selectedIds: [1], selectedCandidates: [ADA], uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [
      { role: 'assistant', content: 'Ada has five years of Python.' },
      { role: 'user', content: 'Who has the most experience?' },
    ],
    suggestions: ['Compare their skills'], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
    ...overrides,
  };
  render(<MemoryRouter initialEntries={['/hiring?view=chat']}><Dashboard /><Address /></MemoryRouter>);
  return mocks.app;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the candidate chat', () => {
  it('is a log, so a screen reader reads each reply as it arrives', () => {
    open();
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(log.textContent).toContain('Ada has five years of Python.');
    expect(log.textContent).toContain('Who has the most experience?');
  });

  it('says what the message box is for, without emoji', () => {
    open();
    const box = screen.getByRole('textbox', { name: 'Message the AI assistant' });
    expect(box.getAttribute('placeholder')).toBe('Ask about your selected candidates…');
  });

  it('sends a suggestion as a message', () => {
    const app = open();
    fireEvent.click(screen.getByRole('button', { name: 'Compare their skills' }));
    expect(app.sendMessage).toHaveBeenCalled();
    expect(app.sendMessage.mock.calls[0][0]).toBe('Compare their skills');
  });

  it('with nobody selected, leads to Candidates', () => {
    open({ selectedIds: [], selectedCandidates: [], messages: [] });
    expect(screen.getByText('Select candidates in Candidates to chat about them.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Candidates' }));
    expect(screen.getByTestId('address').textContent).toBe('?view=upload');
  });
});

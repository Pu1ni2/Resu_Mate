import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './Dashboard';
import CandidateFocus from './CandidateFocus';
import HiringAgentPanel from './focus/HiringAgentPanel';

/* The dashboard's chat, over the selected candidates, and the candidate
 * file's chat, about one person, were both called "A second perspective".
 * Each is named now for what it answers from, and the file's is reached from
 * the assistant, not a button of its own among the file's actions. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Engineer', skills: ['Python'], is_resume: true };
const BEA = { id: 2, name: 'Bea', predicted_role: 'Designer', skills: ['Figma'], is_resume: true };

function app(selected) {
  return {
    candidates: [ADA, BEA], selectedIds: selected.map(c => c.id), selectedCandidates: selected, uploadProgress: {}, loading: false,
    loadCandidates: vi.fn(), uploadResume: vi.fn().mockResolvedValue({}), deleteCandidate: vi.fn(),
    clearAllCandidates: vi.fn(), toggleSelection: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(),
    anonymize: false, setAnonymize: vi.fn(), analytics: null,
    messages: [], suggestions: [], isTyping: false, sendMessage: vi.fn(), initChat: vi.fn(), clearChat: vi.fn(),
    getDisplayName: c => c.name, getAvatarGradient: () => 'none',
    hiringManager: { name: 'Morgan', email: 'morgan@co.com' }, logoutHiringManager: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the dashboard's chat", () => {
  it('is named for the selected candidates, and says how many it answers from', () => {
    mocks.app = app([ADA, BEA]);
    render(<MemoryRouter initialEntries={['/hiring?view=chat']}><Dashboard /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Your selected candidates.' })).toBeTruthy();
    expect(screen.getByText('Answers from 2 selected candidates')).toBeTruthy();
    expect(screen.queryByText(/second perspective/i)).toBeNull();
  });

  it('says "candidate" for one', () => {
    mocks.app = app([ADA]);
    render(<MemoryRouter initialEntries={['/hiring?view=chat']}><Dashboard /></MemoryRouter>);
    expect(screen.getByText('Answers from 1 selected candidate')).toBeTruthy();
  });
});

describe("the candidate file's chat", () => {
  it('is named for the one candidate, and answers from their file', () => {
    mocks.app = app([]);
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    const entry = screen.getByRole('button', { name: /Ask about this candidate\s*Answers from their file/ });
    fireEvent.click(entry);
    expect(screen.getByText('ABOUT THIS CANDIDATE')).toBeTruthy();
    expect(screen.getByText(/Answers come from this candidate's file\./)).toBeTruthy();
    expect(screen.queryByText(/second perspective/i)).toBeNull();
  });

  it("is the assistant's first choice in the file, and no longer a button among its actions", () => {
    mocks.app = app([BEA]);
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Discuss/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Assistant' }));
    const [first] = screen.getByRole('group', { name: 'Ask about' }).querySelectorAll('a, button');
    expect(first.textContent).toBe('This candidateAnswers from Ada’s file');
    fireEvent.click(first);
    expect(screen.getByText('ABOUT THIS CANDIDATE')).toBeTruthy();
  });

  it('names the person as the file does, so not while names are hidden', () => {
    mocks.app = { ...app([]), anonymize: true, getDisplayName: (c, i) => `Candidate ${i + 1}` };
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Assistant' }));
    expect(screen.getByRole('button', { name: /^This candidate/ }).textContent).toBe('This candidateAnswers from Candidate 1’s file');
  });

  it("is what an evaluation's own button opens, by the same name", () => {
    const onSwitchToChat = vi.fn();
    render(<HiringAgentPanel agentStep="result" agentResult={{ report: 'A strong fit.' }} onSwitchToChat={onSwitchToChat} onReset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask about this candidate' }));
    expect(onSwitchToChat).toHaveBeenCalledTimes(1);
  });
});

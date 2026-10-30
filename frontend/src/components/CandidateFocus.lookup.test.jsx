import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* Looking a candidate up online, which searches the web by their name for a
 * GitHub and a LinkedIn: it used to happen the moment a file opened. Now
 * only when the manager asks, never while names are hidden, and the chat
 * doesn't wait for it. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('../hooks/useVoice', () => ({ default: () => ({ stopSpeaking: vi.fn(), speakText: vi.fn(), loadingMsgIndex: null, speakingMsgIndex: null }) }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true, text: 'Ada built reporting tools.' };
const FOUND = {
  logs: [{ step: 'gh', msg: 'Found GitHub from the résumé: ada', status: 'success' }],
  profiles: { github: { username: 'ada', public_repos: 7 }, linkedin: null, portfolio: null },
  ai_summary: '', contact: {},
};

const reply = body => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const calls = path => fetch.mock.calls.filter(([url]) => String(url).includes(path));
const open = () => render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
const lookUp = () => fireEvent.click(screen.getByRole('button', { name: 'Look them up online' }));
const firstMessage = () => document.querySelector('.chat-bubble.assistant').textContent;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA], anonymize: false, getDisplayName: c => c.name };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/scan-resume')) return reply(FOUND);
    if (String(url).includes('/chat/focus')) return reply({ response: 'Ada writes Python.', suggestions: [] });
    return reply({});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('looking a candidate up online', () => {
  it('waits to be asked, says what it searches, and then looks them up', async () => {
    open();
    expect(calls('/scan-resume')).toHaveLength(0);
    const status = screen.getByText(/not looked up online yet/i);
    // A screen reader hears it change: the lookup starting, and how it ended.
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toMatch(/searches the web for their GitHub and LinkedIn/);

    lookUp();
    await waitFor(() => expect(screen.getByText('Looked up online')).toBeTruthy());
    expect(calls('/scan-resume')).toHaveLength(1);
    expect(JSON.parse(calls('/scan-resume')[0][1].body).candidate_id).toBe(1);
    expect(screen.queryByRole('button', { name: 'Look them up online' })).toBeNull();
  });

  it('is not offered while names are hidden, and says why', () => {
    mocks.app.anonymize = true;
    open();
    expect(screen.queryByRole('button', { name: 'Look them up online' })).toBeNull();
    expect(screen.getByText("Names are hidden, so they aren't looked up online.")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the chat', () => {
  it('opens on the résumé alone, ready to ask', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Discuss candidate' }));
    expect(firstMessage()).toMatch(/Resume — skills, experience, education/);
    expect(firstMessage()).not.toMatch(/GitHub/);
    // Nothing to ask about GitHub before there is a profile.
    expect(screen.queryByRole('button', { name: 'Tell me about their GitHub projects' })).toBeNull();

    const input = screen.getByRole('textbox', { name: 'Ask about Ada' });
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: 'What does Ada build?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Ada writes Python.')).toBeTruthy();
    expect(calls('/scan-resume')).toHaveLength(0);
  });

  it('gets what a lookup found in its first message, and keeps the conversation', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Discuss candidate' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about Ada' }), { target: { value: 'What does Ada build?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Ada writes Python.');

    lookUp();
    await waitFor(() => expect(firstMessage()).toMatch(/GitHub \(@ada\) — 7 repos/));
    expect(screen.getByText('What does Ada build?')).toBeTruthy();
    expect(screen.getByText('Ada writes Python.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tell me about their GitHub projects' })).toBeTruthy();
  });

  it('is put back when the file opens again, though nobody was looked up', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Discuss candidate' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about Ada' }), { target: { value: 'What does Ada build?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Ada writes Python.');

    fireEvent.click(screen.getByRole('button', { name: 'All candidate files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open file for Ada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discuss candidate' }));
    expect(screen.getByText('What does Ada build?')).toBeTruthy();
    expect(screen.getByText('Ada writes Python.')).toBeTruthy();
  });
});

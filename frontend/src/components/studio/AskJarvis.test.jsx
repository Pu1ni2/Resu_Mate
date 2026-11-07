import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CandidateFocus from '../CandidateFocus';
import { jarvisSummary } from './AskJarvis';

/* Jarvis could be opened only from the dashboard: the candidate file, Find
 * candidates and the rest had no way to it. Every manager page's assistant
 * offers it now, opening it over the page. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../../context/AppContext', () => ({ useApp: () => mocks.app }));

const ADA = {
  id: 1, name: 'Ada', predicted_role: 'Data Engineer', skills: ['Python'], is_resume: true,
  embedded_links: { github_url: 'https://github.com/ada' },
};
const NOTE = { id: 2, name: 'Shopping list', skills: [], is_resume: false };

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  // Jarvis greets on opening through the speech API, which jsdom does not have.
  window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };
  mocks.app = { candidates: [ADA, NOTE], anonymize: false, getDisplayName: c => c.name };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Jarvis on a page other than the dashboard', () => {
  it('opens over the candidate file, and closes back to it', async () => {
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Assistant' }));
    fireEvent.click(screen.getByRole('button', { name: /^The whole workspace/ }));
    expect(await screen.findByRole('dialog', { name: 'Jarvis, the hiring copilot' }, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close jarvis/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Jarvis, the hiring copilot' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy();
  });

  // The assistant offers it as "The whole workspace"; the two chats answer
  // from fewer.
  it('says it looks across the whole workspace, as the assistant names it', async () => {
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Assistant' }));
    fireEvent.click(screen.getByRole('button', { name: /^The whole workspace/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Jarvis, the hiring copilot' }, { timeout: 5000 });
    expect(within(dialog).getByText(/^Jarvis looks across your whole workspace\./)).toBeTruthy();
  });
});

describe('what Jarvis is told of the candidates', () => {
  it('is the résumés, with what it needs to act on them', () => {
    expect(jarvisSummary([ADA, NOTE])).toEqual([{
      id: 1, name: 'Ada', predicted_role: 'Data Engineer', total_experience_years: null, experience_level: '',
      location: '', email: '', skills: ['Python'], github_url: 'https://github.com/ada', linkedin_url: '',
    }]);
    expect(jarvisSummary(undefined)).toEqual([]);
  });
});

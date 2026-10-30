import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* The candidate file's buttons are announced by the words they show, so a
 * screen reader and speech control go by the same words as the eye. "Open
 * file" was "Open Focus" on every card, whoever it opened, and "Evaluate role
 * fit" was "Hiring Agent". */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('../hooks/useVoice', () => ({ default: () => ({ stopSpeaking: vi.fn(), speakText: vi.fn(), loadingMsgIndex: null, speakingMsgIndex: null }) }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true, text: 'Ada built reporting tools.' };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Backend Engineer', skills: ['Go'], is_resume: true, text: 'Grace builds systems.' };

const words = el => el.textContent.replace(/\s+/g, ' ').trim();

/* Buttons whose own label leaves out the words they show. */
function mislabelled() {
  return [...document.querySelectorAll('button, [role="button"]')]
    .filter(el => words(el) && el.getAttribute('aria-label'))
    .filter(el => !el.getAttribute('aria-label').toLowerCase().includes(words(el).toLowerCase()))
    .map(el => `"${words(el)}" announced as "${el.getAttribute('aria-label')}"`);
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA, GRACE], anonymize: false, getDisplayName: c => c.name };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the candidate file's buttons", () => {
  it('on the list say whose file they open', () => {
    render(<MemoryRouter initialEntries={['/hiring/focus']}><CandidateFocus /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Open file for Ada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open file for Grace' })).toBeTruthy();
    expect(mislabelled()).toEqual([]);
  });

  it('in every section of a file go by their own words', () => {
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    const found = [...mislabelled()];
    // Each section, and the second tool inside the ones that have two.
    const visits = [/02 Résumé/, /03 Research/, /GitHub portfolio/, /04 Evaluation/, /Résumé intelligence/, /05 Interviews/, /Scheduling/, /Discuss candidate/];
    for (const name of visits) {
      fireEvent.click(screen.getByRole('button', { name }));
      found.push(...mislabelled());
    }
    expect(found).toEqual([]);
  });

  it('name their groups of tools where a screen reader reads it', () => {
    render(<MemoryRouter initialEntries={['/hiring/focus?candidate=1']}><CandidateFocus /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /04 Evaluation/ }));
    expect(screen.getByRole('group', { name: 'Evaluation tools' })).toBeTruthy();
  });
});

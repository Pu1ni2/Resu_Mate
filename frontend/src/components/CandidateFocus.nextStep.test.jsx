import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CandidateFocus from './CandidateFocus';

/* An open file leads its actions with its one next step: an evaluation, then
 * an interview. It says what role it was evaluated for, and the overview
 * stops asking for an evaluation once there is one. */

const mocks = vi.hoisted(() => ({ app: null }));
vi.mock('../context/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('../hooks/useVoice', () => ({ default: () => ({ stopSpeaking: vi.fn(), speakText: vi.fn(), loadingMsgIndex: null, speakingMsgIndex: null }) }));

const ADA = { id: 1, name: 'Ada', predicted_role: 'Data Scientist', skills: ['Python'], is_resume: true };
const GRACE = { id: 2, name: 'Grace', predicted_role: 'Backend Engineer', skills: ['Go'], is_resume: true };
const SAMPLE = { id: 3, name: 'Sam Sample', predicted_role: 'Analyst', skills: [], is_resume: true, is_sample: true };
const KEPT = {
  evaluation_id: 4, role: 'Backend Engineer', level: 'Senior', experience_required: '5-8 years',
  job_description: null, anonymized: false, report: 'Grace has led two Go services.', created_at: '2026-11-02T15:04:00',
};

let kept;
const reply = body => ({ ok: true, status: 200, json: async () => body });
const open = id => render(<MemoryRouter initialEntries={[`/hiring/focus?candidate=${id}`]}><CandidateFocus /></MemoryRouter>);
const actions = () => document.querySelector('.sf-action-row');
const primary = () => within(actions()).getAllByRole('button').filter(b => b.classList.contains('sf-button-primary'));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.app = { candidates: [ADA, GRACE, SAMPLE], anonymize: false, getDisplayName: c => c.name };
  kept = { 2: [KEPT], 3: [{ ...KEPT, role: 'Analyst' }] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const match = String(url).match(/\/candidates\/(\d+)\/evaluations$/);
    return reply(match ? { evaluations: kept[match[1]] || [] } : {});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("an open file's next step", () => {
  it('is to evaluate role fit before there is an evaluation, offered once', () => {
    open(1);
    expect(primary().map(b => b.textContent.trim())).toEqual(['Evaluate role fit']);
    expect(within(actions()).getAllByRole('button')[0]).toBe(primary()[0]);
    expect(screen.getAllByRole('button', { name: /evaluate role fit/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Create interview' }).disabled).toBe(true);
  });

  it('is to create an interview once evaluated, and the file says for what', async () => {
    open(2);
    expect((await screen.findByText(/^Evaluated for/, { selector: 'p' })).textContent.trim()).toBe('Evaluated for Backend Engineer · Senior');
    expect(primary().map(b => b.textContent.trim())).toEqual(['Create interview']);
    expect(screen.getAllByRole('button', { name: 'Create interview' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Draft email' }).disabled).toBe(false);
  });

  it('leaves the overview saying what was evaluated, not asking again', async () => {
    open(2);
    expect(await screen.findByRole('heading', { name: 'Evaluated for Backend Engineer.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /read the evaluation/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /evaluate role fit/i })).toBeNull();
  });

  it("isn't an interview for the sample résumé, which has no one to invite", async () => {
    open(3);
    await screen.findByRole('heading', { name: 'Evaluated for Analyst.' });
    expect(primary()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Create interview' }).disabled).toBe(true);
  });
});
